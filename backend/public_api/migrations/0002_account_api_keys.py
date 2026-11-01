from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('public_api', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='publicapikey',
            name='is_account_key',
            field=models.BooleanField(default=False, editable=False),
        ),
        migrations.AddConstraint(
            model_name='publicapikey',
            constraint=models.UniqueConstraint(
                fields=('user',),
                condition=models.Q(is_account_key=True, revoked_at__isnull=True),
                name='public_api_one_unrevoked_account_key',
            ),
        ),
    ]
