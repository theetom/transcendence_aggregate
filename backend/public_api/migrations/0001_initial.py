import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PublicAPIKey',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=100)),
                ('key_digest', models.CharField(editable=False, max_length=64, unique=True)),
                ('can_write', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='public_api_keys', to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.CreateModel(
            name='PublicAPIRateLimit',
            fields=[
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE, primary_key=True,
                    related_name='public_api_rate_limit', serialize=False, to=settings.AUTH_USER_MODEL,
                )),
                ('window_start', models.DateTimeField(default=django.utils.timezone.now)),
                ('request_count', models.PositiveIntegerField(default=0)),
            ],
            options={
                'constraints': [models.CheckConstraint(
                    condition=models.Q(request_count__lte=60), name='public_api_rate_count_max_60',
                )],
            },
        ),
    ]
