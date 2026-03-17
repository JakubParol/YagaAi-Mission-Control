from pydantic import BaseModel, Field


class StoryBulkStatusUpdateRequest(BaseModel):
    story_ids: list[str] = Field(..., min_length=1)
    status: str = Field(..., pattern=r"^(TODO|IN_PROGRESS|CODE_REVIEW|VERIFY|DONE)$")


class SprintBulkMembershipRequest(BaseModel):
    story_ids: list[str] = Field(..., min_length=1)


class BulkOperationItemResult(BaseModel):
    entity_id: str
    success: bool
    timestamp: str
    error_code: str | None = None
    error_message: str | None = None


class BulkOperationResponse(BaseModel):
    operation: str
    total: int
    succeeded: int
    failed: int
    results: list[BulkOperationItemResult]


def to_bulk_operation_response(
    *,
    operation: str,
    total: int,
    succeeded: int,
    failed: int,
    results: list[BulkOperationItemResult],
) -> BulkOperationResponse:
    return BulkOperationResponse(
        operation=operation,
        total=total,
        succeeded=succeeded,
        failed=failed,
        results=results,
    )
