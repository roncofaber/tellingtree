import pytest

from client import TellingTreeClient


@pytest.fixture
def api_client(client):
    """Wrap the FastAPI TestClient in a TellingTreeClient."""
    tc = TellingTreeClient.__new__(TellingTreeClient)
    tc._base_url = ""
    tc._http = client
    tc._access_token = None
    tc._refresh_token = None

    from client.auth import AuthClient
    from client.users import UsersClient
    from client.trees import TreesClient
    from client.persons import PersonsClient
    from client.relationships import RelationshipsClient
    from client.stories import StoriesClient
    from client.media import MediaClient
    from client.tags import TagsClient

    tc.auth = AuthClient(tc)
    tc.users = UsersClient(tc)
    tc.trees = TreesClient(tc)
    tc.persons = PersonsClient(tc)
    tc.relationships = RelationshipsClient(tc)
    tc.stories = StoriesClient(tc)
    tc.media = MediaClient(tc)
    tc.tags = TagsClient(tc)
    return tc


@pytest.fixture
def authed_client(api_client):
    api_client.auth.register(
        email="sdk@example.com",
        username="sdkuser",
        password="sdkpassword123",
        full_name="SDK User",
    )
    api_client.auth.login(username="sdkuser", password="sdkpassword123")
    return api_client


class TestAuth:
    def test_register_and_login(self, api_client):
        user = api_client.auth.register(
            email="test@example.com",
            username="testuser",
            password="testpassword123",
        )
        assert user.username == "testuser"
        assert user.email == "test@example.com"

        token = api_client.auth.login(username="testuser", password="testpassword123")
        assert token.access_token
        assert token.refresh_token
        assert api_client.token is not None

    def test_refresh(self, authed_client):
        old_token = authed_client.token
        new_token = authed_client.auth.refresh()
        assert new_token.access_token
        assert authed_client.token == new_token.access_token

    def test_get_me(self, authed_client):
        me = authed_client.users.get_me()
        assert me.username == "sdkuser"
        assert me.email == "sdk@example.com"

    def test_update_me(self, authed_client):
        updated = authed_client.users.update_me(full_name="Updated SDK User")
        assert updated.full_name == "Updated SDK User"


class TestTrees:
    def test_crud(self, authed_client):
        tree = authed_client.trees.create(
            name="Test Tree", description="A test tree"
        )
        assert tree.name == "Test Tree"

        fetched = authed_client.trees.get(tree.id)
        assert fetched.id == tree.id

        updated = authed_client.trees.update(tree.id, name="Renamed Tree")
        assert updated.name == "Renamed Tree"

        trees = authed_client.trees.list()
        assert trees.total == 1

        authed_client.trees.delete(tree.id)
        trees = authed_client.trees.list()
        assert trees.total == 0


class TestPersons:
    def test_crud(self, authed_client):
        tree = authed_client.trees.create(name="Family")
        person = authed_client.persons.create(
            tree.id,
            given_name="Eleanor",
            family_name="Johnson",
            birth_date="1932-03-15",
            gender="female",
        )
        assert person.given_name == "Eleanor"
        assert str(person.birth_date) == "1932-03-15"

        updated = authed_client.persons.update(
            tree.id, person.id, bio="A wonderful grandmother"
        )
        assert updated.bio == "A wonderful grandmother"

        persons = authed_client.persons.list(tree.id)
        assert persons.total == 1

        authed_client.persons.delete(tree.id, person.id)
        persons = authed_client.persons.list(tree.id)
        assert persons.total == 0


class TestRelationships:
    def test_crud(self, authed_client):
        tree = authed_client.trees.create(name="Family")
        parent = authed_client.persons.create(tree.id, given_name="Mom")
        child = authed_client.persons.create(tree.id, given_name="Kid")

        rel = authed_client.relationships.create(
            tree.id,
            person_a_id=parent.id,
            person_b_id=child.id,
            relationship_type="parent",
        )
        assert rel.relationship_type == "parent"

        rels = authed_client.relationships.list(tree.id)
        assert rels.total == 2  # "parent" + auto-created "child" inverse

        person_rels = authed_client.relationships.list_for_person(tree.id, parent.id)
        assert len(person_rels) == 2  # parent appears in both records

        authed_client.relationships.delete(tree.id, rel.id)
        rels = authed_client.relationships.list(tree.id)
        assert rels.total == 0  # both deleted together


class TestStories:
    def test_crud_with_persons_and_tags(self, authed_client):
        tree = authed_client.trees.create(name="Family")
        grandma = authed_client.persons.create(tree.id, given_name="Grandma")
        tag = authed_client.tags.create(tree.id, name="childhood", color="#FF5733")

        story = authed_client.stories.create(
            tree.id,
            title="Summer of '62",
            content="It was the hottest summer...",
            event_date="1962-07-01",
            event_location="Kansas City",
            person_ids=[grandma.id],
            tag_ids=[tag.id],
        )
        assert story.title == "Summer of '62"
        assert grandma.id in story.person_ids
        assert tag.id in story.tag_ids

        stories = authed_client.stories.list(tree.id)
        assert stories.total == 1

        stories_by_person = authed_client.stories.list(tree.id, person_id=grandma.id)
        assert stories_by_person.total == 1

        updated = authed_client.stories.update(
            tree.id, story.id, title="Summer of 1962"
        )
        assert updated.title == "Summer of 1962"

        authed_client.stories.delete(tree.id, story.id)
        stories = authed_client.stories.list(tree.id)
        assert stories.total == 0

    def test_link_unlink_person(self, authed_client):
        tree = authed_client.trees.create(name="Family")
        person = authed_client.persons.create(tree.id, given_name="Uncle Bob")
        story = authed_client.stories.create(tree.id, title="A Tale")

        authed_client.stories.link_person(tree.id, story.id, person.id)
        fetched = authed_client.stories.get(tree.id, story.id)
        assert person.id in fetched.person_ids

        authed_client.stories.unlink_person(tree.id, story.id, person.id)
        fetched = authed_client.stories.get(tree.id, story.id)
        assert person.id not in fetched.person_ids


    def test_add_remove_tag(self, authed_client):
        tree = authed_client.trees.create(name="Family")
        tag = authed_client.tags.create(tree.id, name="war", color="#333333")
        story = authed_client.stories.create(tree.id, title="The Draft")

        authed_client.stories.add_tag(tree.id, story.id, tag.id)
        fetched = authed_client.stories.get(tree.id, story.id)
        assert tag.id in fetched.tag_ids

        authed_client.stories.remove_tag(tree.id, story.id, tag.id)
        fetched = authed_client.stories.get(tree.id, story.id)
        assert tag.id not in fetched.tag_ids


class TestMedia:
    def test_upload_get_delete(self, authed_client, tmp_path):
        tree = authed_client.trees.create(name="Family")

        test_file = tmp_path / "photo.jpg"
        test_file.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)

        media = authed_client.media.upload(tree.id, test_file, caption="Old photo")
        assert media.original_filename == "photo.jpg"
        assert media.caption == "Old photo"
        assert media.media_type == "photo"

        fetched = authed_client.media.get(tree.id, media.id)
        assert fetched.id == media.id

        dest = tmp_path / "downloaded.jpg"
        authed_client.media.download(tree.id, media.id, dest)
        assert dest.exists()
        assert dest.read_bytes() == test_file.read_bytes()

        authed_client.media.delete(tree.id, media.id)
        import httpx
        with pytest.raises(httpx.HTTPStatusError):
            authed_client.media.get(tree.id, media.id)

    def test_upload_with_story(self, authed_client, tmp_path):
        tree = authed_client.trees.create(name="Family")
        story = authed_client.stories.create(tree.id, title="A Memory")

        test_file = tmp_path / "audio.mp3"
        test_file.write_bytes(b"\x00" * 50)

        media = authed_client.media.upload(
            tree.id, test_file, story_id=story.id
        )
        assert media.story_id == story.id
        assert media.media_type == "audio"


class TestPasswordChange:
    def test_change_password(self, authed_client):
        authed_client.users.change_password(
            current_password="sdkpassword123",
            new_password="newsecurepassword456",
        )
        authed_client.auth.login(username="sdkuser", password="newsecurepassword456")
        me = authed_client.users.get_me()
        assert me.username == "sdkuser"

    def test_wrong_current_password(self, authed_client):
        import httpx
        with pytest.raises(httpx.HTTPStatusError):
            authed_client.users.change_password(
                current_password="wrongpassword",
                new_password="newsecurepassword456",
            )


class TestTokenRevocation:
    def test_old_token_rejected_after_password_change(self, authed_client):
        old_token = authed_client.token
        authed_client.users.change_password(
            current_password="sdkpassword123",
            new_password="newsecurepassword456",
        )
        # Old token should be rejected
        authed_client.token = old_token
        import httpx
        with pytest.raises(httpx.HTTPStatusError):
            authed_client.users.get_me()

        # Login with new password works
        authed_client.auth.login(username="sdkuser", password="newsecurepassword456")
        me = authed_client.users.get_me()
        assert me.username == "sdkuser"


class TestTreeTransfer:
    def test_transfer_ownership(self, api_client, make_user):
        api_client.auth.register(
            email="owner@example.com", username="owner", password="password123"
        )
        api_client.auth.login(username="owner", password="password123")
        tree = api_client.trees.create(name="Shared Tree")

        member = make_user(email="member@example.com", username="member", password="password123")
        api_client.trees.add_member(tree.id, username="member", role="editor")

        transferred = api_client.trees.transfer(tree.id, str(member.id))
        assert str(transferred.owner_id) == str(member.id)

    def test_non_owner_cannot_transfer(self, api_client, make_user):
        api_client.auth.register(
            email="owner2@example.com", username="owner2", password="password123"
        )
        api_client.auth.login(username="owner2", password="password123")
        tree = api_client.trees.create(name="My Tree")

        editor = make_user(email="editor2@example.com", username="editor2", password="password123")
        api_client.trees.add_member(tree.id, username="editor2", role="admin")

        api_client.auth.login(username="editor2", password="password123")

        import httpx
        with pytest.raises(httpx.HTTPStatusError):
            api_client.trees.transfer(tree.id, str(editor.id))


class TestAccountDeletion:
    def test_delete_account_no_trees(self, api_client):
        api_client.auth.register(
            email="delete@example.com", username="deleteuser", password="password123"
        )
        api_client.auth.login(username="deleteuser", password="password123")
        api_client.users.delete_account(password="password123")

        import httpx
        with pytest.raises(httpx.HTTPStatusError):
            api_client.auth.login(username="deleteuser", password="password123")

    def test_delete_blocked_if_owns_trees(self, authed_client):
        authed_client.trees.create(name="My Tree")

        import httpx
        with pytest.raises(httpx.HTTPStatusError):
            authed_client.users.delete_account(password="sdkpassword123")

    def test_delete_after_transfer(self, api_client, make_user):
        api_client.auth.register(
            email="leaving@example.com", username="leaving", password="password123"
        )
        api_client.auth.login(username="leaving", password="password123")
        tree = api_client.trees.create(name="Family Tree")

        staying = make_user(email="staying@example.com", username="staying", password="password123")
        api_client.trees.add_member(tree.id, username="staying", role="editor")

        api_client.trees.transfer(tree.id, str(staying.id))
        api_client.users.delete_account(password="password123")

        # Tree still exists, now owned by "staying"
        api_client.auth.login(username="staying", password="password123")
        fetched = api_client.trees.get(tree.id)
        assert str(fetched.owner_id) == str(staying.id)


class TestTags:
    def test_crud(self, authed_client):
        tree = authed_client.trees.create(name="Family")
        tag = authed_client.tags.create(tree.id, name="holiday", color="#00FF00")
        assert tag.name == "holiday"
        assert tag.color == "#00FF00"

        tags = authed_client.tags.list(tree.id)
        assert len(tags) == 1

        updated = authed_client.tags.update(tree.id, tag.id, name="vacation")
        assert updated.name == "vacation"

        authed_client.tags.delete(tree.id, tag.id)
        tags = authed_client.tags.list(tree.id)
        assert len(tags) == 0
