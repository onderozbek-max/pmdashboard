"""
BigQuery client factory.

CRITICAL: _make_bq_client() strips quota_project_id from credentials to avoid
the x-goog-user-project header that triggers USER_PROJECT_DENIED in
VPC Service Controls environments.

Pattern preserved verbatim from mmc-dashboard/app/services/batch.py.
DO NOT modify the credential stripping logic without testing in the VPC-SC environment.
"""
import google.auth
import google.cloud.bigquery as bq_lib


def _make_bq_client(project: str):
    """
    Build a BigQuery client that bills to `project` directly.

    Problem: gcloud sometimes writes quota_project_id into the ADC credentials
    file (application_default_credentials.json), typically set to the user's
    default gcloud project (e.g. wmt-martech-sams-lmd-prod). The Python BQ
    library reads that field and adds an x-goog-user-project header to every
    API request — telling GCP to bill to the wrong project. When the ADC quota
    project is different from the BQ target project, VPC Service Controls
    denies the request with USER_PROJECT_DENIED, even on the correct network.

    Fix: strip quota_project_id from the credential before passing it to the
    client so no x-goog-user-project header is sent. GCP then bills to
    `project` directly (the same project as the query target), which is what
    we want and what the user has access to.
    """
    creds, _ = google.auth.default()
    # with_quota_project(None) returns a copy with quota_project_id cleared,
    # which suppresses the x-goog-user-project header entirely.
    if hasattr(creds, "with_quota_project"):
        creds = creds.with_quota_project(None)
    return bq_lib.Client(project=project, credentials=creds)
