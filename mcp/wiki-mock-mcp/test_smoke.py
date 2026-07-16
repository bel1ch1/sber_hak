"""Offline smoke test: wiki store + registered MCP tools."""
import os

os.environ.setdefault("MCP_PORT", "9102")

from wiki_store import WikiStore

st = WikiStore()
pages = st.list()
assert len(pages) >= 6, len(pages)
slugs = {p["slug"] for p in pages}
for expected in ("company-overview", "access-policy", "onboarding-checklist", "training-courses"):
    assert expected in slugs, expected
print(f"[store] pages={len(pages)} slugs sample={sorted(slugs)[:4]}")

# get
page = st.get("access-policy")
assert page and "Naumen" in page["body"]
print(f"[store] get access-policy -> title='{page['title']}' body_len={len(page['body'])}")

# search finds the right page
res = st.search("доступы backend Naumen")
assert res and res[0]["slug"] == "access-policy", res[:2]
print(f"[store] search 'доступы backend Naumen' -> top={res[0]['slug']} ({len(res)} hits)")

res2 = st.search("бадди наставник")
assert any(r["slug"] == "buddy-program" for r in res2), res2
print(f"[store] search 'бадди наставник' -> {[r['slug'] for r in res2]}")

# registered MCP tools
import server
assert server.wiki_list_pages()["ok"]
assert server.wiki_get_page("team-payments")["page"]["title"].startswith("Команда")
miss = server.wiki_get_page("no-such")
assert miss["ok"] is False and "available" in miss
srch = server.wiki_search("курсы security обязательно")
assert srch["ok"] and srch["results"]
print(f"[tool] wiki_search 'курсы security' -> {[r['slug'] for r in srch['results']]}")

print("\nSMOKE OK ✅")
