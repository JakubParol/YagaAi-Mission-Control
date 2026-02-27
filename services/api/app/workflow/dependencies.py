from app.config import settings
from app.workflow.application.workflow_service import WorkflowService
from app.workflow.infrastructure.filesystem_adapter import FilesystemWorkflowAdapter


def get_workflow_service() -> WorkflowService:
    adapter = FilesystemWorkflowAdapter(settings.workflow_system_path)
    return WorkflowService(adapter)
