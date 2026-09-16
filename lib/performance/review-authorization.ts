export type ReviewActorInput = {
  userId: string;
  employeeId: string | null;
  managerId: string | null;
  isAdmin: boolean;
};

export type ReviewActor = {
  isEmployee: boolean;
  isManager: boolean;
  isAdmin: boolean;
  canSubmitInput: boolean;
  canManage: boolean;
};

export function reviewActorFor({
  userId,
  employeeId,
  managerId,
  isAdmin,
}: ReviewActorInput): ReviewActor {
  const isEmployee = employeeId === userId;
  const isManager = managerId === userId;

  return {
    isEmployee,
    isManager,
    isAdmin,
    canSubmitInput: isEmployee,
    canManage: isAdmin || isManager,
  };
}

export function employeeReviewTransitionAllowed(
  currentStatus: string | null | undefined,
  nextStatus: string,
) {
  return nextStatus === "employee_input" && currentStatus !== "complete";
}

export function canFinalizeReview(
  actor: ReviewActor,
  currentStatus: string | null | undefined,
) {
  return actor.canManage && currentStatus !== "complete";
}

export function canWriteManagerNotes(actor: ReviewActor) {
  return actor.canManage;
}

