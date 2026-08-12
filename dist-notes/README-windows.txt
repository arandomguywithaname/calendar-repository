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

A black window opens and asks you two questions. It tells you exactly where to
get each answer. It takes about a minute, and it only happens the first time —
your answers are saved next to the .exe in a file called .env

Then it says:  Bot @yourbotname listening.

Leave that window open. That window IS the bot. Closing it stops it.

Now open your bot in Telegram and send:  /connect


WHY IT ASKS FOR TWO THINGS
--------------------------

Because Telegram won't let one credential do both jobs.

A bot can only see channels where it has been made an administrator. It cannot
see a channel you merely follow — which is exactly what you want it to read.
Reading your subscriptions means signing in as you, and that uses a different
part of Telegram with its own credentials.

So: the bot token is how you talk to it. The api_id and api_hash are how it
reads your channels. Both are free and the setup tells you where to click.


SIGNING IN
----------

Send /connect and it asks for your phone number, then the code Telegram sends
you.

Send the code WITH DASHES, like  1-2-3-4-5

This matters. Telegram scans chats for login codes and cancels any code it
finds posted in one. The dashes get it past that check. The bot removes them
before using the code.

If your account has two-step verification, put the password after the code:

    1-2-3-4-5 mypassword

The bot deletes that message as soon as it has read it. If Telegram won't let
it, it says so and asks you to delete it yourself.


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
    Telegram cancelled the code because it saw it in a chat. Send /connect
    again and use dashes this time.

Telegram invalidated my session
    Someone ended the session from your account's device list. Send /connect.


STOPPING IT
-----------

Close the window, or press Ctrl+C in it.

To start it again later, double-click the .exe. It won't ask you anything the
second time.
