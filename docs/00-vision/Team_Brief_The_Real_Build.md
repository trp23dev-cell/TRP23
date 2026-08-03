# The Real Build

**A brief for the team**
**Date:** 27 July 2026

---

## Read this first

What we've built so far was a mock-up. It proved the idea works. Now we build the real thing.

I want to be straight with you about something before we start. We built a game, and it's good, but it tells the wrong story. Not slightly wrong. Opposite.

The whole thing is framed as a police case file. There's a corkboard on the wall of every room with red pins and string, and the cards on it read `LAST ARREST`, `SUBJECT`, `THE PLUG`, `THE STASH`. The UI calls things "CASE 01" and stamps "CLEARED" when you finish. It's well made. The person who built it put real care into it.

But read it back. It's a police investigation into a criminal come-up. And the Bible I wrote says Trapology exists to help people untrap themselves. Those two things are pointing in opposite directions, and if we build the real game on top of the wrong one we'll spend the next two years explaining ourselves.

So here's what we're doing about it, and I think it's the best idea in this document.

## The fix: flip whose case file it is

It's not the police investigating you.

**It's your own case file. On yourself.**

The board on the wall isn't evidence against a dealer. It's where you pin what's trapping you. The subject of the investigation is you. When you stamp CLEARED, you're clearing part of your own file.

That's it. That's the change.

And look at what it costs us. Nothing. Every texture stays. The corkboard, the pins, the string, the tilted cards, the CLEARED stamp, the whole visual language survives untouched. We change the words on eight cards and we change the meaning of the entire game.

More than that. Volume 3 of the Bible says stage two of becoming a Trapologist is Acknowledgement: *"Nothing changes until you admit where you are."* We already built the perfect object for that. We just pointed it at the wrong person.

The trap house stops being something to aspire to and becomes the evidence. That's the difference between glamorising it and escaping it, and it's the thing that would have got us in trouble.

---

## Does the Bible give us a story?

Somebody asked me this and it's the right question. Here's the honest answer.

No. There's no plot in it. No characters, no world, no script. I went back through all fourteen volumes to check.

What it does give us is better than a plot, because a plot goes out of date.

**Volume 3 is the story structure, already written.** The seven stages of the Trapologist Journey: Overstanding, Acknowledgement, Strategy, Action, Weekly Self Audit, Discipline, Becoming a Trapologist. That's a complete arc. Somebody who doesn't know where they are, admits it, makes a plan, does the work, checks themselves, keeps going, and comes out the other side as something different. Every good story ever told is shaped like that.

**Volume 6 and 9 give us the rule:** every collection is a chapter, the chapter defines the product, and there are no random drops.

**Volume 10 gives us the job:** *"a clear and concise story, which is told through the online game and the way of purchasing clothes."* My words. The game carries the story. That's not a nice-to-have, it's the whole reason we're building a game instead of a website.

**Volume 5 gives us the physical layer:** evidence bags, newspapers, archive folders as packaging. The box the garment arrives in is part of the story.

So the story doesn't exist yet. We write it. The Bible tells us exactly what shape it has to be, which means we can't get it badly wrong.

---

## The spine

Seven stages, six chapters. Here's how they map.

| Stage | Where it lives | What the player is doing |
|---|---|---|
| 1. Overstanding | Prologue and the opening of Chapter 01 | Realising the way they think came from somewhere |
| 2. Acknowledgement | **Chapter 01, at the board** | Writing down their own trap and pinning it up |
| 3. Strategy | Chapter 02, The Kitchen | Making a plan with a route out of it |
| 4. Action | Chapter 03, Graveyard Shift | Doing the work when nobody's watching |
| 5. Weekly Self Audit | **A weekly ritual, not a room.** Starts in Chapter 03, runs forever | Four questions, every week, with a history they can look back on |
| 6. Discipline | Chapter 04 and Chapter 05 | Standards and ownership. Making it normal instead of a burst |
| 7. Becoming a Trapologist | Chapter 06 and everything past it | Earning the title |

Two things I want to flag on this.

**Stage 5 is the one that will keep people coming back.** The weekly self audit is four questions from Volume 3: did I do what I promised myself, what distracted me, what moved me closer, what habits change next week. It's the strongest thing in the entire Bible and there is currently not one line of code for it. If we build one new system this year, build that one.

**Stage 7 has a hard rule and I'm not moving on it.** Volume 3 says the title cannot be bought. Volume 11 says membership begins with mindset, not purchases. So: **no amount of money can make someone a Trapologist in this game.** Not a bundle, not a tier, not a shortcut. I want that enforced in the code with a test that fails if anyone ever wires a purchase to it, so it can't happen by accident in two years when none of us are looking at that file.

---

## The names are changing, and here's why

This is the part I expect pushback on, so let me show my working rather than just announce it.

I asked for these to be decided by what aligns with the Bible, not by what I feel like. So I went name by name and applied our own Decision Framework from Volume 6: does it protect the vision, does it help people untrap themselves, does it strengthen the brand long term.

| Now | Decision | Why |
|---|---|---|
| 01 THE COME UP | **Keep** | My own story in Volume 1 is a come-up out of hardship. The Bible backs this word directly |
| 02 THE COOK UP | **THE KITCHEN** | A cook up is drug manufacture. Nothing in fourteen volumes supports it. And its own subtitle already says *"the kitchen is where plans get made"* — Volume 2 says *"every trap needs an exit plan"*. The better name was already sitting in our own copy |
| 03 GRAVEYARD SHIFT | **Keep** | Working nights. That's my dad's work ethic in Volume 1 and it's Discipline in Volume 2 |
| 04 THE FRONT | **THE SHOP FLOOR** | A front launders money. Volume 12 is nine chapters about running a real shop properly. This chapter's own moral line is already "Reputation: lead with standards" |
| 05 TOP FLOOR | **Keep** | Nothing in it depicts dealing, and it carries Volume 3's Discipline stage: making success the normal routine instead of a burst |
| 06 THE WAREHOUSE | **Keep** | Ownership and legacy. Volume 5's future ecosystem |
| "find the stash" | **"find the archive"** | This one has the strongest backing of the lot. Volume 5 names *"evidence bags, newspapers, archive folders"* as our packaging language. The word was already ours |

**The principle: the grit stays, the drug dealing goes.**

I want to be clear that this is not us going soft. Volume 1 is me writing about losing my mum at ten, my dad going to prison, and serving time myself. The Bible has never asked to be sanitised and I'm not asking for that now. It asks that nothing glamorise the trap. So the only words changing are the ones that specifically depict dealing. Four of six chapter names stay exactly as they are.

**The archive works identically to the stash.** Same hidden object, same hand-placed spots, same written hint on the mission card, same 500 coins, same real discount code climbing from 10% to 40% across the chapters. Nothing about the mechanic changes. What changes is what it is: a record somebody left behind before they got out, instead of contraband.

That reframe actually makes the mechanic better. Right now you find a box and get a code. After this, you find proof that somebody sat in the room you're standing in, wrote down what was holding them, and left. That's a story beat. It was a loot drop.

### While we're on names: the ones above us are settled

We've been loose with this and it's caused confusion, so for the avoidance of doubt:

- **Trapology** is the philosophy. It's what the Bible is, it's the doctrine, it's what we build everything against.
- **Trap Made It** is the official name of the game and the shop. That's the name customers see, the name on the store listing, the name we build under.
- **TRP 23** is the short form. Use it internally, in the repo, in filenames.

So: Trapology is what we believe. Trap Made It is what we ship. Anything in the code or the docs using another name for the product is wrong and should be corrected as we touch it.

---

## Chapter 01, written out

Here's the pattern. If the team likes this, we write chapters 02 to 06 the same way.

**THE COME UP** — Stage 1, Overstanding, into Stage 2, Acknowledgement.

**The setup.** You wake up in a room you didn't choose. Somebody lived here before you and left in a hurry. Their stuff is still here. On the wall there's a board, and it isn't the police's board. It's theirs. They were working something out on it before they went.

**The board.** Eight cards, replacing the eight we have now:

| Now | Becomes |
|---|---|
| `LAST ARREST` | `SUBJECT: YOU` |
| `SUBJECT` | `WHAT'S TRAPPING ME` |
| `THE PLUG` | `WHO I BLAME` |
| `WAREHOUSE` | `WHAT I ACTUALLY CONTROL` |
| `CASE FILE` | `FIRST MOVE` |
| `THE STASH` | `THE WAY OUT` |
| `DROP 03/12` | `EVIDENCE` |
| `LOCATION?` | `CLEARED?` |

Same generated corkboard, same pins, same string. Eight strings of text.

**The moment that matters.** One card on that board is blank. The player writes on it. They type what's trapping them, in their own words, and it pins to the board.

That's Acknowledgement. That's stage two, and it's a text input and a database row.

Then it comes back. That card follows them. It's on the board in every chapter after this one. And in Chapter 06, in their own warehouse, we show it to them again and ask one question: does this still hold you?

I don't think there's a cheaper way to make somebody feel something. It's a saved string and a callback five chapters later.

**Objectives.** Three, same structure as now:

- *Get your bearings. Somebody lived here before you. Look at what they left behind.*
- *There's a board on the wall. It isn't the police's. Read it, then finish it.*
- *Every spot has one. Somebody hid a record here before they got out. Find it.*

**The locked door.** *"It won't budge. Finish the board, archive included, and the way out opens."*

That's Volume 2 as a game mechanic: nothing changes until you admit where you are. You literally cannot leave the room until you've acknowledged your trap. I like that a lot.

**The archive find.** *"Tucked exactly where the board said it'd be. Inside, a folder. Somebody sat in this room and wrote down what was holding them, then wrote down what they did about it. They're not here any more."* Then the coins and the deal code, exactly as it works today.

**The light.** Chapter 01 stays the darkest thing in the game. Don't brighten it. It's the bottom, and the player needs to feel the bottom so that chapter 06 lands.

---

## Three things we already built and forgot about

I went through the code properly before writing this. Some of what we need is already there.

**1. The moral lines are in the game and the player has never seen them.**

We wrote six of them. *"Awareness: you are not stuck forever."* *"Discipline: craft over chaos."* *"Consistency: pressure is not your identity."* *"Reputation: lead with standards."* *"Ownership: build what lasts."* *"Legacy: create opportunity for others."*

They load into the runtime at `src/game.js:217` and that is the only place they appear. They're never drawn on screen. Our actual moral thesis is one render call away from the player and has been the whole time. That's a day of work at most, and it's the cheapest alignment win available to us.

One change I want: Chapter 02's line is currently "Discipline: craft over chaos", but 02 is now The Kitchen and it's the Strategy chapter. Change it to **"Strategy: every trap needs an exit plan"**, which is Volume 2 word for word. The discipline line fits Chapter 03 better anyway.

**2. The rooms already get lighter as you go, by accident.**

Chapter 01 sits in near-black with heavy fog. Chapter 06, the warehouse, is grey daylight with the thinnest fog in the game. The trend is already in the code.

It isn't a clean line, and it shouldn't be. Chapter 03 is the foggiest room we have, because it's the night shift, and the story dips there before it climbs. That's dramatically correct.

So we're not inventing this. We're formalising it. **As the player progresses, the world visibly gets lighter and more legitimate.** That's the moral arc carried by the art instead of by text, and it's half built already. Art team: this is your spine for the whole game.

**3. The pipeline for real 3D art exists, is tested, and is switched off.**

Every room right now is procedural geometry and canvas-drawn textures. No models, no real environment art. That's the main reason it looks like a prototype.

But somebody built the route out of that already. `src/render/roomAssetRegistry.js` will load a proper GLB model and an HDRI per room, apply it, and hide the procedural version so the two can coexist while we migrate one room at a time. There's a 176-line validator that runs on boot to catch mistakes. Every entry is sitting at `enabled: false`.

This is how we get the real thing without a rewrite. We turn it on for Chapter 01, we put real art in one room, we ship that, and then we do it five more times.

---

## What we are not throwing away

I want to say this plainly because "we're rebuilding" makes people nervous about their work.

- **The archive loop.** Hidden object, hand-placed in believable spots, written hint, real discount code that climbs 10 to 40 percent, protected server-side against being claimed twice. This is the one mechanic that connects the game to the business. Nobody touches it.
- **The 3D inspect viewer.** Auto-spins, you can grab and spin it, resumes on its own after a moment, real product photography, colour swatches that swap the garment in place. And spinning it a full 360 completes an objective, which means we have one mission in the game completed by a physical gesture rather than a click. That's real game design. Keep it.
- **The case file language.** "CASE 01", "Item Analysis", the CLEARED stamp, the tilted cards. Distinctive, cheap, coherent. We're changing who the file is about, not the aesthetic.
- **The economy and the accounts.** Server-authoritative wallet, ledger, bank with deposit, withdraw and player-to-player transfer, proper signup with two-factor, progress that survives logout. More backend rigour than most prototypes get and it's the right shape for real money later.
- **The room craft.** The Chapter 02 kitchen is built from parametric cabinet runs, a tiled splashback and a stove made from twelve separate pieces. Chapter 03 has a CRT television generating live static every frame that drives a flickering light. That's care, not placeholder. Whoever did that: it shows.

---

## Where the real work is

Six workstreams. First milestone is **Chapter 01 rebuilt properly, end to end** — not all six chapters half done.

**Story and narrative.** Owns the spine. First task: write chapters 02 to 06 to the pattern above, including board cards, objectives, archive text and moral line for each. Blocked by nothing. Start now.

**Art and 3D.** Owns how it looks. First task: Chapter 01 as a real authored environment, delivered as GLB plus HDRI to the existing registry format. Second task: the light and legitimacy arc across all six chapters as a single lookdev plan. Blocked by the narrative charter for Chapter 01, which is in this document.

**Game client.** Owns the runtime. First tasks, in order: render the moral lines; flip the board cards; build the name-your-trap input and persist it; turn on the room asset registry for Chapter 01. Then the bigger one below.

**Backend.** Owns the economy, accounts, and content. First task: make the CMS actually drive missions. Right now `type`, `requirement`, `limit` and `antiAbuseRule` in our content file are decorative — the runtime merges missions by id and hardcodes every threshold, so a new mission added in the CMS does nothing. The Bible says collections are chapters and chapters define the product. We can't honour that until content can create gameplay.

**Ops and admin.** Owns running it. The admin page edits chapter text and nothing else. It can't see an order, process a refund, manage stock or moderate a story, even though the API for all of that exists. Nobody can run this business without a developer until that's built.

**Journey systems.** Owns Volume 3 as software. First task: the weekly self audit. Then the name-your-trap callback in Chapter 06, then the discipline ladder, then the Trapologist rank with the test that stops anyone selling it.

**One bug worth fixing today.** At `src/game.js:2073` we call `isTouchDevice` on its own, but that variable doesn't exist — it's a property of `platform`, and everywhere else in the file gets that right. It throws inside the function that starts the game, which kills everything after it, including the opening story message and a progress save. It's a one-word fix and it's currently eating our first line of story.

---

## What I need from you

Four things.

1. Tell me if the case file flip is right. It's the biggest idea here and I'd rather hear the objection now than in three months.
2. Tell me if the name changes hold up. I've shown you the Bible basis for each one. If you think I've got one wrong, say so.
3. Chapter 01 is written above as the pattern. React to it. If it doesn't land, we fix the pattern before we write five more.
4. Own a workstream.

Everything in this document traces back to the Bible. That's deliberate. I don't want us building on my taste, or anyone's taste. I want us building on what we already decided we stand for, so that when we disagree we've got something to check against instead of arguing.

The three questions from Volume 6 are how we settle anything: does this protect the vision, does it help people untrap themselves, does it strengthen the brand long term. If the answer's no, we don't do it. I'd like those three lines on the wall and in every pull request.

One last thing, because it's the whole point.

The trap was never the environment. The trap was believing you couldn't change it. That's what the game has to make somebody feel by the time they walk into their own warehouse in chapter six. Everything above is in service of that one feeling.

Let's build it properly this time.

---

*[Sign-off: the founder name we publish under still needs settling. The Bible is signed Kamani Dean Smith and the codebase copyright says KimaniTheBarber. One answer needed before any store listing or trademark filing.]*
