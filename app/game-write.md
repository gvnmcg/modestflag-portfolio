
# Game Write

Simple Crud that will allow people to add game content text into a database 

MySQL database tables
	- Location - 
    id,
    name, 
    x,
    y, 
    size

	- NPC- 
    id, 
    location_id, 
    name, 
    desc, 
    disposition, 
    openness, 
    conscientiousness, 
    extraversion, 
    agreeableness,  
    neuroticism.

	- Response - 
    id, 
    npc_id, 
    call, 
    response, 
    effect


```sql
	CREATE TABLE Location (
    id int ,
    name TEXT ,
    x int ,
    y, int  
    siz int e
  )

CREATE TABLE NPC(
    id INT , 
    location_id INT , 
    name TEXT , 
    desc TEXT ,
    art_tag TEXT, 
    disposition INT , 
    openness INT , 
    conscientiousness INT , 
    extraversion INT , 
    agreeableness INT ,  
    neuroticism INT .
)
CREATE TABLE Response (
    id INT , 
    npc_id INT , 
    call TEXT , 
    response TEXT , 
    effect TEXT 
)

```


I've built out the full tool. Here's what's in place:

Database — private/schema.sql: fixes the typos in your table defs (stray commas, size → siz int e, missing PRIMARY KEY/AUTO_INCREMENT), renames desc → description and backtick-quotes `call` since both are MySQL reserved words that would otherwise break queries.

Backend (PHP, session-based auth, JSON APIs):

private/config.example.php — copy to config.php on the server with your real DB creds + a password hash (private/config.php is now gitignored, so real credentials never get committed)
private/db.php, auth.php, helpers.php — PDO connection, login-check guard, JSON request/response helpers
app/api/login.php, locations.php, npcs.php, responses.php, upload.php — full CRUD, all requiring login except login itself
Frontend — app/game-write.html: single self-contained file (matches the style of your other app/*.html tools), password login → Locations → NPCs → Responses flow with breadcrumb nav. Black background, white text, grey borders, no accent colors except a red for destructive actions. Small textarea for "call", large one for "response". NPC art shows a "No Art" placeholder box until uploaded (upload happens after NPC creation, via a file input on the detail screen). A collapsible JSON panel on the right shows the current location/NPC/responses as raw JSON, per your ask.

Decisions I made without asking: a single shared password (no per-user accounts, since it's just friends helping out) hashed with password_hash, and native <dialog> modals for create/edit forms instead of a JS framework.

To deploy on cPanel: create the DB, run schema.sql, copy config.example.php → config.php and fill in real values, upload everything, then visit app/game-write.html.

I haven't run this against a live PHP/MySQL server since none is available here — worth a smoke test on your cPanel host before handing it to friends.

