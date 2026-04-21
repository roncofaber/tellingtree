import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, ForbiddenError, NotFoundError
from app.db.session import get_db
from app.models.tree import Tree, TreeMember
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.tree import (
    TreeCreate,
    TreeMemberCreate,
    TreeMemberResponse,
    TreeMemberUpdate,
    TreeResponse,
    TreeTransfer,
    TreeUpdate,
)
from app.services.permission import check_tree_access
from app.api.v1.deps import pagination_params

router = APIRouter(prefix="/trees", tags=["trees"])


@router.get("", response_model=PaginatedResponse[TreeResponse])
def list_trees(
    pagination: dict = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Tree).filter(
        or_(
            Tree.owner_id == current_user.id,
            Tree.id.in_(
                db.query(TreeMember.tree_id).filter(TreeMember.user_id == current_user.id)
            ),
        )
    )
    total = query.count()
    items = query.offset(pagination["skip"]).limit(pagination["limit"]).all()
    return PaginatedResponse(
        items=items, total=total, skip=pagination["skip"], limit=pagination["limit"]
    )


@router.post("", response_model=TreeResponse, status_code=201)
def create_tree(
    data: TreeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tree = Tree(owner_id=current_user.id, **data.model_dump())
    db.add(tree)
    db.flush()
    db.add(TreeMember(tree_id=tree.id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(tree)
    return tree


@router.get("/{tree_id}", response_model=TreeResponse)
def get_tree(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return check_tree_access(db, tree_id, current_user.id, "viewer")


@router.put("/{tree_id}", response_model=TreeResponse)
def update_tree(
    tree_id: uuid.UUID,
    data: TreeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tree = check_tree_access(db, tree_id, current_user.id, "admin")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tree, key, value)
    db.commit()
    db.refresh(tree)
    return tree


@router.delete("/{tree_id}", status_code=204)
def delete_tree(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tree = check_tree_access(db, tree_id, current_user.id, "admin")
    if tree.owner_id != current_user.id:
        raise ForbiddenError("Only the owner can delete a tree")
    db.delete(tree)
    db.commit()


@router.put("/{tree_id}/transfer", response_model=TreeResponse)
def transfer_tree(
    tree_id: uuid.UUID,
    data: TreeTransfer,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tree = check_tree_access(db, tree_id, current_user.id, "admin")
    if tree.owner_id != current_user.id:
        raise ForbiddenError("Only the owner can transfer a tree")

    if data.new_owner_id == current_user.id:
        raise BadRequestError("Cannot transfer to yourself")

    member = (
        db.query(TreeMember)
        .filter(TreeMember.tree_id == tree_id, TreeMember.user_id == data.new_owner_id)
        .first()
    )
    if member is None:
        raise BadRequestError("New owner must be a member of the tree")

    tree.owner_id = data.new_owner_id
    db.delete(member)
    db.commit()
    db.refresh(tree)
    return tree


# --- Tree Members ---


@router.get("/{tree_id}/members", response_model=list[TreeMemberResponse])
def list_members(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    members = db.query(TreeMember).filter(TreeMember.tree_id == tree_id).all()
    result = []
    for m in members:
        resp = TreeMemberResponse.model_validate(m)
        resp.username = m.user.username
        result.append(resp)
    return result


@router.post("/{tree_id}/members", response_model=TreeMemberResponse, status_code=201)
def add_member(
    tree_id: uuid.UUID,
    data: TreeMemberCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")

    user = db.query(User).filter(User.username == data.username).first()
    if user is None:
        raise NotFoundError("User not found")

    existing = (
        db.query(TreeMember)
        .filter(TreeMember.tree_id == tree_id, TreeMember.user_id == user.id)
        .first()
    )
    if existing:
        raise ForbiddenError("User is already a member")

    member = TreeMember(tree_id=tree_id, user_id=user.id, role=data.role)
    db.add(member)
    db.commit()
    db.refresh(member)
    resp = TreeMemberResponse.model_validate(member)
    resp.username = user.username
    return resp


@router.put("/{tree_id}/members/{user_id}", response_model=TreeMemberResponse)
def update_member(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    data: TreeMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")

    member = (
        db.query(TreeMember)
        .filter(TreeMember.tree_id == tree_id, TreeMember.user_id == user_id)
        .first()
    )
    if member is None:
        raise NotFoundError("Member not found")

    member.role = data.role
    db.commit()
    db.refresh(member)
    resp = TreeMemberResponse.model_validate(member)
    resp.username = member.user.username
    return resp


@router.delete("/{tree_id}/members/{user_id}", status_code=204)
def remove_member(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tree = check_tree_access(db, tree_id, current_user.id, "admin")
    if user_id == tree.owner_id:
        raise ForbiddenError("Cannot remove the tree owner")

    member = (
        db.query(TreeMember)
        .filter(TreeMember.tree_id == tree_id, TreeMember.user_id == user_id)
        .first()
    )
    if member is None:
        raise NotFoundError("Member not found")

    db.delete(member)
    db.commit()
