"""Public recipe/review analytics from one consistent, read-only snapshot."""

import datetime
import logging
import re

from django.db import DatabaseError, InterfaceError, connection, transaction
from django.db.models import Avg, Count, Subquery
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from reviews.models import Review
from .models import Category, Recipe


logger = logging.getLogger(__name__)
UTC = datetime.timezone.utc
MAX_DAYS = 366
MAX_IDENTIFIER = 9007199254740991  # Exact in browser JSON numbers and PostgreSQL bigint.
DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
IDENTIFIER_PATTERN = re.compile(r"[1-9][0-9]{0,18}\Z")
FILTER_NAMES = {"start", "end", "category", "q", "rating"}


class AnalyticsFiltersError(ValueError):
    def __init__(self, fields):
        self.fields = fields


def read_filters(params):
    """Validate all URL input before the first database statement."""
    errors = {}
    if set(params) - FILTER_NAMES:
        errors["filters"] = "Use only start, end, category, q and rating filters."
    for name in FILTER_NAMES & set(params):
        if len(params.getlist(name)) != 1:
            errors[name] = "Send each filter only once."
    if errors:
        raise AnalyticsFiltersError(errors)

    if ("start" in params) != ("end" in params):
        raise AnalyticsFiltersError({"dates": "Choose both a start date and an end date."})
    if "start" not in params:
        end = timezone.now().astimezone(UTC).date()
        start = end - datetime.timedelta(days=29)
    else:
        dates = {}
        for name in ("start", "end"):
            value = params[name]
            try:
                if not DATE_PATTERN.fullmatch(value):
                    raise ValueError
                dates[name] = datetime.date.fromisoformat(value)
            except (ValueError, TypeError):
                errors[name] = "Choose a valid date in YYYY-MM-DD format."
        if errors:
            raise AnalyticsFiltersError(errors)
        start, end = dates["start"], dates["end"]

    if end < start:
        errors["dates"] = "The end date must be on or after the start date."
    elif (end - start).days + 1 > MAX_DAYS:
        errors["dates"] = "Choose a date range of at most 366 days."
    try:
        end_exclusive = end + datetime.timedelta(days=1)
    except OverflowError:
        errors["end"] = "Choose an end date earlier than 9999-12-31."
        end_exclusive = None

    category = None
    if "category" in params:
        value = params["category"]
        if not IDENTIFIER_PATTERN.fullmatch(value) or int(value) > MAX_IDENTIFIER:
            errors["category"] = "Choose a valid category."
        else:
            category = int(value)
    q = params.get("q", "").strip()
    if len(q) > 100:
        errors["q"] = "Use at most 100 characters for the recipe title filter."
    try:
        q.encode("utf-8")
    except UnicodeError:
        errors["q"] = "Use valid Unicode text for the recipe title filter."
    if "\x00" in q:
        errors["q"] = "The recipe title filter cannot contain null characters."
    rating = None
    if "rating" in params:
        value = params["rating"]
        if value not in ("1", "2", "3", "4", "5"):
            errors["rating"] = "Choose a rating from 1 to 5."
        else:
            rating = int(value)
    if errors:
        raise AnalyticsFiltersError(errors)

    filters = {"start": start.isoformat(), "end": end.isoformat(),
               "category": category, "q": q, "rating": rating}
    return filters, start, end, datetime.datetime.combine(start, datetime.time.min, UTC), \
        datetime.datetime.combine(end_exclusive, datetime.time.min, UTC)


def average(value):
    return None if value is None else round(float(value), 2)


def build_analytics(filters, start, end, start_at, end_at):
    recipes = Recipe.objects.filter(approved=True)
    if filters["category"] is not None:
        # A subquery keeps category membership from multiplying aggregate rows.
        category_recipes = Recipe.categories.through.objects.filter(
            category_id=filters["category"],
        ).values("recipe_id")
        recipes = recipes.filter(pk__in=Subquery(category_recipes))
    if filters["q"]:
        recipes = recipes.filter(title__icontains=filters["q"])

    review_base = Review.objects.filter(
        recipe_id__in=Subquery(recipes.values("pk")),
        timestamp__gte=start_at, timestamp__lt=end_at,
        grade__gte=1, grade__lte=5,
    )
    reviews = review_base if filters["rating"] is None else review_base.filter(grade=filters["rating"])
    statistics = reviews.aggregate(
        review_count=Count("id"), reviewed_recipe_count=Count("recipe_id", distinct=True),
        average_rating=Avg("grade"),
    )
    created_rows = recipes.filter(date_created__gte=start_at, date_created__lt=end_at).annotate(
        day=TruncDate("date_created", tzinfo=UTC),
    ).values("day").annotate(recipes_created=Count("id")).order_by("day")
    created_by_day = {row["day"]: row["recipes_created"] for row in created_rows}
    review_rows = reviews.annotate(day=TruncDate("timestamp", tzinfo=UTC)).values("day").annotate(
        reviews=Count("id"), average_rating=Avg("grade"),
    ).order_by("day")
    reviews_by_day = {row["day"]: row for row in review_rows}
    daily = []
    for offset in range((end - start).days + 1):
        day = start + datetime.timedelta(days=offset)
        row = reviews_by_day.get(day)
        daily.append({
            "date": day.isoformat(),
            "recipes_created": created_by_day.get(day, 0),
            "reviews": row["reviews"] if row else 0,
            "average_rating": average(row["average_rating"]) if row else None,
        })

    distribution_rows = review_base.values("grade").annotate(review_count=Count("id")).order_by("grade")
    distribution = {row["grade"]: row["review_count"] for row in distribution_rows}
    ranking_rows = reviews.values("recipe_id", "recipe__title").annotate(
        review_count=Count("id"), average_rating=Avg("grade"),
    ).filter(review_count__gt=0).order_by(
        "-review_count", "-average_rating", "recipe__title", "recipe_id",
    )[:10]
    top_recipes = [{
        "id": row["recipe_id"], "title": row["recipe__title"],
        "review_count": row["review_count"], "average_rating": average(row["average_rating"]),
    } for row in ranking_rows]
    categories = list(Category.objects.filter(recipes__approved=True).order_by("name", "id").values(
        "id", "name",
    ).distinct())

    return {
        "generated_at": timezone.now().isoformat(),
        "timezone": "UTC",
        "filters": filters,
        "limits": {"max_days": MAX_DAYS},
        "categories": categories,
        "summary": {
            "matching_recipes": recipes.count(),
            "recipes_created": sum(created_by_day.values()),
            "reviews": statistics["review_count"],
            "reviewed_recipes": statistics["reviewed_recipe_count"],
            "average_rating": average(statistics["average_rating"]),
        },
        "daily": daily,
        # Keep all five rating options visible when a review rating is selected.
        "rating_distribution": [{"rating": grade, "review_count": distribution.get(grade, 0)}
                                for grade in range(1, 6)],
        "top_recipes": top_recipes,
    }


class RecipeAnalyticsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer]
    throttle_classes = []

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def get(self, request):
        try:
            filters = read_filters(request.query_params)
        except AnalyticsFiltersError as error:
            return Response({"error": "Check the analytics filters.", "fields": error.fields}, status=400)
        try:
            # This is the first database statement: auth is deliberately omitted
            # because the same approved-only aggregates are public to everyone.
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                    cursor.execute("SET LOCAL statement_timeout = '5000ms'")
                payload = build_analytics(*filters)
            return Response(payload)
        except (DatabaseError, InterfaceError):
            logger.warning("Recipe analytics could not read the database snapshot.")
            try:
                connection.close()
            except (DatabaseError, InterfaceError):
                pass
            return Response({"error": "Recipe analytics are temporarily unavailable. Try refreshing shortly."}, status=503)
