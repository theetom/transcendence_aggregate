"""Private, portable own-recipe downloads and validated batch-copy imports."""

from collections.abc import Mapping
import hashlib
import logging
from pathlib import PurePath
import re
from uuid import UUID

from django.db import transaction
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Recipe, RecipeImage, RecipeImportReceipt
from .transfer_formats import MAX_RECIPES, MAX_TRANSFER_BYTES, decode_recipes, encode_recipes


logger = logging.getLogger(__name__)
DIGEST = re.compile(r"[0-9a-f]{64}\Z")


class RecipeTransferView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]
    throttle_classes = []

    def initial(self, request, *args, **kwargs):
        if not request.is_secure():
            raise PermissionDenied("Use HTTPS to transfer your recipes.")
        super().initial(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        patch_vary_headers(response, ["Authorization"])
        return response


class RecipeDataView(RecipeTransferView):
    def get(self, request):
        return Response({
            "user_id": request.user.pk,
            "recipes": list(Recipe.objects.filter(user=request.user).order_by("title", "id").values("id", "title")),
            "limits": {"max_recipes": MAX_RECIPES, "max_file_bytes": MAX_TRANSFER_BYTES},
        })


class RecipeExportView(RecipeTransferView):
    def post(self, request):
        data = request.data
        if not isinstance(data, Mapping) or set(data) != {"format", "recipe_ids"}:
            raise ValidationError({"error": "Choose a file format and the recipes to download."})
        format_name = data["format"]
        if format_name not in ("json", "csv"):
            raise ValidationError({"error": "Choose JSON or CSV."})
        ids = data["recipe_ids"]
        if (not isinstance(ids, list) or not 1 <= len(ids) <= MAX_RECIPES
                or any(type(identifier) is not int or identifier < 1 for identifier in ids)
                or len(set(ids)) != len(ids)):
            raise ValidationError({"error": f"Select between 1 and {MAX_RECIPES} different recipes."})

        # Website edits take the same row locks, keeping the content/photos coherent.
        with transaction.atomic():
            recipes = list(Recipe.objects.select_for_update().filter(
                user=request.user, pk__in=ids,
            ).order_by("id").prefetch_related(
                "recipe_ingredients__ingredient", "categories", "steps", "images",
            ))
            if len(recipes) != len(ids):
                raise PermissionDenied("Select only recipes from your own account.")
            content = encode_recipes(recipes, format_name)
        mime = "application/json" if format_name == "json" else "text/csv"
        response = HttpResponse(content, content_type=mime + "; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="recipes.{format_name}"'
        return response


def read_upload(request, expected_fields):
    if (set(request.data) != expected_fields or set(request.FILES) != {"file"}
            or any(len(request.data.getlist(name)) != 1 for name in expected_fields)):
        raise ValidationError({"error": "Choose exactly one recipe file and the requested import fields."})
    uploaded = request.FILES["file"]
    if not 0 < uploaded.size <= MAX_TRANSFER_BYTES:
        raise ValidationError({"error": "Choose a nonempty recipe file no larger than 20 MiB."})
    format_name = PurePath(uploaded.name).suffix.lower().lstrip(".")
    if format_name not in ("json", "csv"):
        raise ValidationError({"error": "Choose a JSON or CSV recipe file downloaded from Recipe data."})
    raw = uploaded.read(MAX_TRANSFER_BYTES + 1)
    if len(raw) != uploaded.size or len(raw) > MAX_TRANSFER_BYTES:
        raise ValidationError({"error": "The recipe file could not be read completely."})
    return raw, format_name, hashlib.sha256(raw).hexdigest()


def close_photos(rows):
    for _, photos in rows:
        for photo in photos:
            photo.close()


class RecipeValidateView(RecipeTransferView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        raw, format_name, digest = read_upload(request, {"file"})
        rows = decode_recipes(raw, format_name)
        try:
            return Response({
                "user_id": request.user.pk,
                "sha256": digest,
                "format": format_name,
                "recipe_count": len(rows),
                "recipes": [
                    {"row": index, "title": serializer.validated_data["title"]}
                    for index, (serializer, _) in enumerate(rows, start=1)
                ],
            })
        finally:
            close_photos(rows)


def receipt_payload(receipt, *, replayed):
    return {
        "user_id": receipt.user_id,
        "request_id": str(receipt.request_id),
        "sha256": receipt.file_sha256,
        "recipe_count": len(receipt.recipes),
        "recipes": receipt.recipes,
        "pending": True,
        "replayed": replayed,
    }


class RecipeImportView(RecipeTransferView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        raw, format_name, digest = read_upload(request, {"file", "sha256", "request_id"})
        expected_digest = request.data["sha256"]
        try:
            request_id = UUID(request.data["request_id"])
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"error": "Check the recipe file again before importing."})
        if not DIGEST.fullmatch(expected_digest) or expected_digest != digest:
            raise ValidationError({"error": "The file changed. Check it again before importing."})

        # A committed receipt may be returned without repeating image decoding.
        existing = RecipeImportReceipt.objects.filter(user=request.user, request_id=request_id).first()
        if existing is not None:
            if existing.file_sha256 != digest:
                return Response({"error": "This import request belongs to a different file."}, status=409)
            return Response(receipt_payload(existing, replayed=True))

        rows = decode_recipes(raw, format_name)
        created_files = []
        try:
            # The unique receipt insert also serializes concurrent retries. Neither
            # it nor any recipe becomes visible until the entire batch commits.
            with transaction.atomic():
                receipt, created = RecipeImportReceipt.objects.get_or_create(
                    user=request.user, request_id=request_id,
                    defaults={"file_sha256": digest},
                )
                if not created:
                    if receipt.file_sha256 != digest:
                        return Response({"error": "This import request belongs to a different file."}, status=409)
                    return Response(receipt_payload(receipt, replayed=True))
                results = []
                for serializer, photos in rows:
                    recipe = serializer.save(
                        user=request.user, approved=False, rejected=False,
                        rejection_reason="", deletion_requested=False,
                    )
                    for uploaded in photos:
                        photo = RecipeImage(recipe=recipe)
                        photo.image.save(uploaded.name, uploaded, save=False)
                        created_files.append((photo.image.storage, photo.image.name))
                        photo.save()
                    results.append({"id": recipe.pk, "title": recipe.title})
                receipt.recipes = results
                receipt.save(update_fields=["recipes"])
                response = Response(receipt_payload(receipt, replayed=False), status=201)
            return response
        except Exception:
            for storage, name in created_files:
                try:
                    storage.delete(name)
                except Exception:
                    logger.exception("Could not remove a photo after a failed recipe import.")
            raise
        finally:
            close_photos(rows)


class RecipeImportStatusView(RecipeTransferView):
    def get(self, request, request_id):
        receipt = RecipeImportReceipt.objects.filter(user=request.user, request_id=request_id).first()
        if receipt is None:
            raise NotFound("This import is not confirmed yet. Keep the same file and check again.")
        return Response(receipt_payload(receipt, replayed=True))
