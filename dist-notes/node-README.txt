CHANNEL DIGEST BOT
==================

A Telegram bot that reads the channels you follow, merges the same story told
by five different channels into one, and then talks to you about it.

You need Node.js 20 or newer. Nothing to install — everything is in bot.js.


START HERE
----------

1. Open @BotFather in Telegram. Send /newbot. Follow the prompts.
   It gives you a token that looks like 123456789:AAH-xxxxxxxxxxxxxxxxxx

2. Go to https://my.telegram.org and log in with your phone number.
   Click "API development tools", create an app (any name will do).
   It shows you an api_id (a number) and an api_hash (a long string).

3. Open the file called .env in this folder and paste all three values in.

4. Run it:

       node bot.js

5. Open your bot in Telegram and send /connect


WHY TWO SETS OF CREDENTIALS
---------------------------

Because Telegram will not let one set do both jobs.

A bot can only see channels where it has been made an administrator. It cannot
see a channel you merely follow — which is exactly the thing you want read. The
only way to read your subscriptions is to sign in as you, and that uses a
different Telegram interface with different credentials.

So: the bot token is how you talk to it. The api_id/api_hash is how it reads
your channels. Both are free and take about a minute each.


SIGNING IN
----------

Send /connect and it asks for your phone number, then the code Telegram sends
you.

Send the code WITH DASHES, like 1-2-3-4-5.

This matters. Telegram scans chats for login codes and cancels any code it
finds posted in one. Dashes get it past that check. The bot strips them before
using the code.

If your account has two-step verification, put the password after the code:

    1-2-3-4-5 mypassword

The bot deletes that message as soon as it has read it. If Telegram refuses to
let it, it will tell you and ask you to delete it yourself.


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

A file called data/digest-store.json, next to bot.js. Nowhere else.

It holds your digests, your Telegram session, and your conversation with the
bot. It does NOT hold your posts — those are read, summarised, and thrown away
in the same breath. That is deliberate: it is what makes asking about last
month as cheap as asking about today.

The session in that file can read your Telegram account. Treat the file the way
you would treat a password. /forget deletes the session from it; ending the
session from Telegram's own device list works too.


WITHOUT AN ANTHROPIC API KEY
----------------------------

It still works and still reads your real channels.

What you lose is the merging. Deciding that two posts describe the same event
is a judgement about meaning — two channels can report one thing without
sharing a single word — and that needs a model. Without one it falls back to
matching vocabulary, which catches near-identical reposts and misses the rest.

When that happens the digest says so on screen, and answers drawn from it say
so too. It will not pretend to have merged more than it did.


IF SOMETHING GOES WRONG
-----------------------

"TELEGRAM_BOT_TOKEN is not set"
    Step 3 — the .env file needs to be in the same folder as bot.js.

"Another poller is holding this bot token"
    The bot is already running somewhere else. Close the other one.

"PHONE_CODE_INVALID"
    Telegram cancelled the code because it saw it in a chat. Send /connect
    again and use dashes this time.

Telegram invalidated my session
    Someone ended the session from your account's device list. Send /connect.
