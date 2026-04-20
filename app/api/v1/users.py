from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, ConflictError
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.tree import Tree, TreeMember
from app.models.user import User
from app.schemas.user import AccountDelete, PasswordChange, UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.email is not None and data.email != current_user.email:
        existing = db.query(User).filter(User.email == data.email).first()
        if existing:
            raise ConflictError("Email already in use")
        current_user.email = data.email

    if data.full_name is not None:
        current_user.full_name = data.full_name

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/password", status_code=204)
def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise BadRequestError("Current password is incorrect")
    current_user.password_hash = hash_password(data.new_password)
    current_user.token_version += 1
    db.commit()


@router.delete("/me", status_code=204)
def delete_account(
    data: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.password, current_user.password_hash):
        raise BadRequestError("Incorrect password")

    owned_trees = db.query(Tree).filter(Tree.owner_id == current_user.id).all()
    if owned_trees:
        tree_names = [t.name for t in owned_trees]
        raise BadRequestError(
            f"Transfer ownership of your trees before deleting your account: {', '.join(tree_names)}"
        )

    db.query(TreeMember).filter(TreeMember.user_id == current_user.id).delete()
    db.delete(current_user)
    db.commit()
