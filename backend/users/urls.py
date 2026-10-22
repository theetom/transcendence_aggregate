from django.urls import path
from . import views

urlpatterns = [
	path("users/", views.users_list),
	path("sign_up/", views.sign_up),
	path("logout/", views.logout),
	path("users/id/<int:user_id>/", views.user_detail_by_id),
	path("users/<str:username>/", views.user_detail),
	path("users/<str:username>", views.user_detail),
	path("me/", views.user_me),
]