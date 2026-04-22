import uuid

from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError
from app.models.tree import Tree, TreeMember, slugify

ROLE_HIERARCHY = {"viewer": 0, "editor": 1, "admin": 2}


def resolve_tree_id(db: Session, tree_id_or_slug: str) -> uuid.UUID:
    try:
        return uuid.UUID(tree_id_or_slug)
    except ValueError:
        tree = db.query(Tree).filter(Tree.slug == tree_id_or_slug).first()
        if tree is None:
            raise NotFoundError("Tree not found")
        return tree.id


def make_unique_slug(db: Session, name: str, exclude_id: uuid.UUID | None = None) -> str:
    base = slugify(name)
    candidate = base
    suffix = 2
    while True:
        query = db.query(Tree.id).filter(Tree.slug == candidate)
        if exclude_id:
            query = query.filter(Tree.id != exclude_id)
        if query.first() is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


def get_tree_or_404(db: Session, tree_id: uuid.UUID) -> Tree:
    tree = db.query(Tree).filter(Tree.id == tree_id).first()
    if tree is None:
        raise NotFoundError("Tree not found")
    return tree


def check_tree_access(
    db: Session,
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    required_role: str = "viewer",
) -> Tree:
    tree = get_tree_or_404(db, tree_id)

    if tree.owner_id == user_id:
        return tree

    member = (
        db.query(TreeMember)
        .filter(TreeMember.tree_id == tree_id, TreeMember.user_id == user_id)
        .first()
    )

    if member is None:
        if tree.is_public and required_role == "viewer":
            return tree
        raise ForbiddenError("You do not have access to this tree")

    if ROLE_HIERARCHY.get(member.role, -1) < ROLE_HIERARCHY.get(required_role, 99):
        raise ForbiddenError(f"Requires '{required_role}' role or higher")

    return tree
