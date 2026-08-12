CHANNEL DIGEST BOT
==================

A Telegram bot that reads the channels you follow, merges the same story told
by five different channels into one, and then talks to you about it.

Nothing to install. No Node, no npm, no command line needed.


START IT
--------

Double-click  channel-digest-bot.exe


WINDOWS WILL WARN YOU THE FIRST TIME
------------------------------------

You'll see a blue box: "Windows protected your PC."

That is SmartScreen, and it says that about every program that hasn't been
signed with a paid certificate. It is not a virus warning — it means Windows
doesn't recognise the publisher.

To run it:

    Click  "More info"
    Then click  "Run anyway"

You'll only be asked once.


WHAT HAPPENS NEXT
-----------------

A black window opens and walks you through it. There are two parts.

FIRST, it needs permission to talk to Telegram at all.

    Go to  https://my.telegram.org
    Log in with your phone number
    Click "API development tools" and create an app (any name)
    It shows an  api_id  (a number) and an  api_hash  (a long string)

Paste those in when asked. This is the one part nobody can do for you —
Telegram only issues these to a logged-in account, and only you have yours.

SECOND, it signs you in: your phone number, then the code Telegram sends you.
Type the code in plainly — no dashes, no tricks. You're typing into this
window, not into a Telegram chat, so Telegram has no reason to cancel it.

If your account has two-step verification it asks for that password too.

THEN IT MAKES THE BOT FOR YOU. You do not need to visit @BotFather. Now that
it's signed in as you, it holds that conversation itself and takes the token.

It finishes with:  Bot @yourbotname listening.

Leave that window open. That window IS the bot. Closing it stops it.

Open the bot it just named and send  /digest  — you're already signed in, so
there's no /connect step for you.


WHY IT NEEDS THE api_id AT ALL
------------------------------

A bot can only see channels where it has been made an administrator. It cannot
see a channel you merely follow — which is exactly what you want it to read.
Reading your subscriptions means signing in as you, and that is what the
api_id and api_hash are for: they identify this program to Telegram.

There is no way around that one. The bot token, on the other hand, it now
gets for itself.

If making the bot automatically fails for any reason, it shows you exactly
what BotFather said and falls back to asking you to make one by hand — send
/newbot to @BotFather and paste the token it gives you.


USING IT
--------

Just talk to it:

    what happened today?
    anything about the rate decision?
    what did I miss this week?
    which channels covered the bridge closure?

And there are commands:

    /digest      read what's new now and summarise it
                 /digest 12 re-reads the last 12 hours
    /last        show the most recent digest again
    /history     what it is holding
    /channels    the channels it can see
    /reset       forget the conversation, keep the digests
    /forget      delete its copy of your Telegram session
    /cancel      abandon a half-finished login


WHERE YOUR DATA GOES
--------------------

Two files, both next to the .exe, and nowhere else:

    .env                     your credentials
    data\digest-store.json   your digests and Telegram session

The store does NOT hold your posts. Those are read, summarised, and thrown
away in the same breath. That is deliberate — it is what makes asking about
last month as cheap as asking about today.

The session in that file can read your Telegram account. Treat the folder the
way you would treat a password. /forget deletes the session from it, and
ending the session from Telegram's own device list works too.


WITHOUT AN ANTHROPIC API KEY
----------------------------

Setup offers this and you can skip it. It still works and still reads your
real channels.

What you lose is the merging. Deciding that two posts describe the same event
is a judgement about meaning — two channels can report one thing without
sharing a single word — and that needs a model. Without one it falls back to
matching vocabulary, which catches near-identical reposts and misses the rest.

When that happens the digest says so on screen, and answers drawn from it say
so too. It will not pretend to have merged more than it did.


IF SOMETHING GOES WRONG
-----------------------

The window closes instantly
    It shouldn't — errors keep it open. If it happens anyway, open Command
    Prompt in this folder and type  channel-digest-bot.exe  so you can read
    the message.

"Telegram rejected the bot token"
    The token was mistyped. Delete the .env file and run it again to redo
    setup.

"could not reach api.telegram.org"
    No internet, or a firewall is blocking it. If Telegram is blocked on your
    network, the bot is blocked too.

"Another poller is holding this bot token"
    The bot is already running in another window. Close that one.

"PHONE_CODE_INVALID"
    The code was mistyped, or it expired. It just asks again.

"BotFather didn't reply" / "it limits how many you can have"
    Telegram is rate-limiting the account, or you already have 20 bots. It
    falls back to asking you for a token — send /newbot to @BotFather and
    paste what it gives you.

Telegram invalidated my session
    Someone ended the session from your account's device list. Send /connect.


STOPPING IT
-----------

Close the window, or press Ctrl+C in it.

To start it again later, double-click the .exe. It won't ask you anything the
second time.
