"""API-key-only entry points; website recipe behavior remains shared."""

from django.utils.cache import patch_vary_headers
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.renderers import JSONRenderer
from rest_framework.views import APIView

from recipes.models import Category, Ingredient, Recipe
from recipes.serializers import CategorySerializer, IngredientSerializer, RecipeSummarySerializer
from recipes.views import _recipe_detail, _recipe_intake

from .authentication import PublicAPIKeyAuthentication
from .permissions import PublicAPIKeyPermission


class PublicAPIPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class PublicAPIView(APIView):
    authentication_classes = [PublicAPIKeyAuthentication]
    permission_classes = [PublicAPIKeyPermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    # Authenticated requests consume the shared database quota during authentication.
    throttle_classes = []
    # JSON also keeps API error responses consistent for non-browser clients.
    renderer_classes = [JSONRenderer]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        patch_vary_headers(response, ['Authorization'])
        return response

    def list_response(self, request, queryset, serializer_class):
        paginator = PublicAPIPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        data = serializer_class(page, many=True, context={'review_viewer': request.user}).data
        return paginator.get_paginated_response(data)


def recipe_summaries():
    return Recipe.objects.prefetch_related(
        'categories', 'images', 'recipe_ingredients__ingredient', 'reviews',
    ).order_by('-id')


class RecipesView(PublicAPIView):
    def get(self, request):
        return self.list_response(request, recipe_summaries().filter(approved=True), RecipeSummarySerializer)

    def post(self, request):
        return _recipe_intake(request)


class RecipeView(PublicAPIView):
    def get(self, request, recipe_id):
        return _recipe_detail(request, recipe_id)

    def put(self, request, recipe_id):
        return _recipe_detail(request, recipe_id)

    def delete(self, request, recipe_id):
        return _recipe_detail(request, recipe_id)


class CategoriesView(PublicAPIView):
    def get(self, request):
        categories = Category.objects.filter(recipes__approved=True).distinct().order_by('name', 'id')
        return self.list_response(request, categories, CategorySerializer)


class IngredientsView(PublicAPIView):
    def get(self, request):
        ingredients = Ingredient.objects.filter(
            recipeingredient__recipe__approved=True,
        ).distinct().order_by('name', 'id')
        return self.list_response(request, ingredients, IngredientSerializer)


class OwnRecipesView(PublicAPIView):
    def get(self, request):
        return self.list_response(
            request, recipe_summaries().filter(user=request.user), RecipeSummarySerializer,
        )
