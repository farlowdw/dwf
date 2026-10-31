---
title: >-
  Highlights from BCTCI
hide_title: false
sidebar_label: Highlights
draft: false
description: >-
  Highlights from the BCTCI book by Daniel W. Farlow
tags: 
  - BCTCI
keywords: 
  - bctci
  - beyond cracking the coding interview
authors: 
  - farlow
hide_table_of_contents: false
toc_min_heading_level: 2
toc_max_heading_level: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import LC from '@site/src/components/LC';
import BibRef from '@site/src/components/BibRef';
import TOCInline from '@theme/TOCInline';

import CodeGrid from '@site/src/components/CodeGrid';
import CodeGridCell from '@site/src/components/CodeGridCell';
import CodeEditor from '@site/src/components/CodeEditor';

<!-- import snippet1 from '!!raw-loader!./snippet-1.py'; -->

<TOCInline toc={toc} minHeadingLevel={2} maxHeadingLevel={4} />

## Chapter 0 - Why job searches suck {#c0}

### Several potential points of failure exist that are outside of your control

Just because you fail an interview doesn't mean you're a failure. The odds are high you'll fail *numerous* interviews and often for reasons completely outside of your control. For example:

- Job searches are not deterministic and neither are interview outcomes (same performance may yield different results)
- No feedback loop (usually you don't get any feedback when a company rejects you, whether online or in person)
- Brand recognition often trumps other substantive content on resumes (names of companies and schools matter a lot)

The point is that you have to grow some thick skin when you start interviewing and shopping yourself around for a job.

## Chapter 1 - A brief history of technical interviews {#c1}

### Big tech is currently optimized to reduce false positives

The unfortunate news for you, the candidate, is that *you have to play the game to get the part*. And right now the game for big tech is highly optimized to reduce false positives; that is, companies are more invested in preventing bad hires than making good hires. It makes sense that "big tech" can afford this approach since big tech companies are firmly established. But the catch for candidates is that you have to be willing to jump through the hoops if you want to play in the circus.

## Chapter 2 - What's broken about coding interviews {#c2}

### All it takes is a bad interviewer to sink you

You really have to keep in mind that interviewing is completely non-deterministic. All it takes is a bad interviewer who doesn't want to be there in order to sink your chances. Don't let it destroy your self-confidence. Whenever this happens, try to learn whatever you can from the experience and move on.

This quote is informative:

> Good interviewers can get good signal from a bad question. Bad interviewers cannot even get good signal from a good question. For a good interviewer, the question is just a tool to guide the discussion into interesting areas. For bad interviewers, the question is an absolute to which they must hear the exact answer they have in mind. &#8212; Jos Visser, Member of Technical Staff at OpenAI, and formerly of Google, Facebook, and Amazon

### Technical interviews are somewhat like standardized tests (but without the same care to ensure biases are reduced)

In many ways, technical interviews are similar to standardized tests, especially where the interview process has been highly centralized and standardized; however, unlike standardized tests, tech companies have not invested a great deal of resources ensuring the tests they give are not biased in some way. Your worth is definitely not tied to your end result, and the *vast majority* of candidates have a high standard deviation when it comes to interview success or failure, meaning significant choices concerning your future and/or career are often somewhat random. Keep this in mind before you get too down on yourself.

## Chapter 3 - What recruiters won't tell you {#c3}

### Third-party recruiters are more incentivized by their employer's requirements than your success

> Working with third-party recruiters (also known as agency recruiters) is, at best, mixed. The most important thing to realize about them is that you are not the customer. The employer is. As such, even when they're paid a commission based on your salary, their incentives are, at best, *sometimes* aligned with yours.

This is a good thing to keep in mind. Of course your success is of interest to a recruiter, but don't overestimate your "worth." Their main goal is to *get the deal done*, not make sure you have a sweet deal (even if their commission is based on your salary). Recruiters are evaluated on the number of hires they make, which is independent of compensation.

### When working with an outside recruitment agency, don't share details about your search

> So, when you work with third-party recruiters:
> 
> - Do not tell them *anything* about your job search.
> - Do not share your compensation history/expectations.
> - Always deal directly with the companies they introduce you to, once you establish a point of contact there.
> - Assume that anything you tell your recruiter is going to get back to every company you're working with.

Agency recruiters have more interest in staying employed by *their employers* than doing well with a single client. This can result in seemingly counterintuitive behavior like a recruiter encouraging a company to lowball a client because this builds trust between the company and the agency recruiter. They most often do not have your best interests in mind.

### Use email instead of texting/calling with recruiters

Recruiters are generally seasoned negotiators (even if they don't have a lot of recruitment experience). Working with job searches is what they do daily &#8212; it's what you do once every several years. Interacting with recruiters over calling or texting gives them the upper hand, where you can be put in a pressured situation where they get your impromptu reactions instead of measured responses. Using email levels the playing field a bit. You can be much more deliberate in how you craft responses and inquiries.

## Chapter 4 - What interviewers won't tell you {#c4}

### Optimal answers are more important than signaling good thought processes

What ultimately matters in technical interviews is not showing you have good habits for how you think (i.e., your thought process) &#8212; what matters is that you reach an optimal answer. And that's just the brutal truth. For good interviewers, *both* pieces of evidence are important, but reaching an optimal answer outweighs showing you have good thought processes. When being assessed technically, you want to show that you are an excellent problem solver, and being unable to reach the optimal solution is often seen as a strike against this desirable characteristic.

How can you really improve on reaching an optimal answer? Practice, practice, and more practice.

### Think out loud

Thinking out loud is critical for technical interviews. Solve more and more problems, and try to get used to thinking out loud.

### Be patient with how quickly you begin to code your solution(s)

> Although many candidates believe in coding as soon as possible, the data shows the opposite: successful candidates actually code *slightly* later (about two minutes later in a one-hour interview). This difference is small, but extra surprising given that many unsuccessful candidates will be quite delayed in coding because they lack a working approach. So why would coding later be linked to better outcomes? Communication, essentially. Candidates who explain their approach do better in interviews, but communication takes time.

You should practice how quickly you can implement a solution in code once you've outlined what you plan to do. Ideally, implementation should be the easy part.

## Chapter 5 {#c5}

### Failure is part of the process

Men and women perform roughly the same when you correct for attrition rate after two failed interviews &#8212; women are far more likely than men to quit after 1-2 failed interviews. But if you can accept that taking your licks is part of the growing process, then you can improve your performance substantially.

### Practicing at least five mock interviews makes the difference

Data seem to validate that having done at least 5 mock interviews makes a significant difference for candidates. It's not just about practicing the interview but about receiving actionable feedback.

## Chapter 6 {#c6}

### Consider LinkedIn your online resume

For better or worse, LinkedIn is essentially your online resume. Make sure it's up to date and reflects what you want it to reflect.

### Don't spend valuable time over-optimizing your resume

It's worth it to craft a decent resume, but the reality is that recruiters often don't read your resume (for example, [this insane resume](https://www.reddit.com/r/recruitinghell/comments/qhg5jo/this_resume_got_me_an_interview/) had a 90% callback rate despite its absurdities). Recruiters typically do a skim-job on the resume and look for things like prestigious schools (good) or prestigious companies (even better).

Don't over-optimize on the resume front. It's just not worth it. Your time is better spent practicing interviews and working on outreach.

But whatever you do craft for your resume: make your awesomeness apparent. Quickly. Your resume should be skimmable and make a recruiter want to reach out to you.

### What about side projects?

Side projects are best pursued well in advance of a job search or simply because you enjoy it. Once you're actively looking for a job, your time is better spent on interview prep and outreach.

## Chapter 7 {#c7}

### Effective and ineffective recruiting channels

From most effective to least effective (FAANG and non-FAANG):

- Warm referrals (referrals from people who know you well and have worked with you in the past)
- In-house recruiters contact you
- Apply online
- Cold outreach to hiring managers

Purely ineffective:

- Cold outreach to recruiters
- Cold referrals (referrals from people who don't know you)
- Agency recruiters contact you

### Apply online so long as you don't take constant rejection personal

Applying online is often like screaming into a black whole. Sometimes it's useful, but it's mostly a numbers game. It's okay to apply so long as you don't start to take the deafening silence personal &#8212; but it's hard not to be worn down by that over time.

### Warm referrals are the best (if they're real)

This is outside your control, but warm referrals are often the best source of getting a real chance at a company, but the person referring you needs to know you *for real*. Of course, it's unlikely you'll have a meaningful connection at every company you want to apply to.

### Avoid cold referrals, agency recruiters, and cold outreach to recruiters

These approaches yielded minimal results (often even net negative effects).

### Reaching out to hiring managers is your best bet

Hiring managers are incentivized to get stuff done. They're more likely to take a risk.

### Tooling for sending emails - LinkedIn Sales Navigator, RocketReach, Streak

LinkedIn Sales Navigator will help you find hiring managers, RocketReach will help with email discovery, and Streak lets you do mail merges in Gmail.

- [LinkedIn Sales Navigator](https://business.linkedin.com/sales-solutions/sales-navigator)
- [RocketReach email finder](https://rocketreach.co/resources/email-finder/)
- [Streak](https://www.streak.com/mail-merge-gmail) (send personalized emails at scale)

### Starting your job search in earnest (what to do)

:::tip

When you're actually ready to begin acting on the content in this section, consulting the following section in detail will be useful: [Treat your job search like a sales funnel](/docs/bctci/job-searches-start-to-finish/c7/#treat-your-job-search-like-a-sales-funnel)

:::

First get access to the tools listed above (i.e., LinkedIn Sales Navigator, RocketReach, and Streak). Then the general outline for what you need to do is the following:

1. Figure out which companies you're interested in (e.g., [Y Combinator](https://www.workatastartup.com/), [levels.fyi](https://www.levels.fyi/?compare=Booz%20Allen%20Hamilton,Capital%20One,Microsoft&track=Software%20Engineer), [Glassdoor](https://www.glassdoor.com/Community/index.htm), [Blind](https://www.teamblind.com/), [Remote Rocketship](https://www.remoterocketship.com/?page=1&sort=DateAdded), [Wellfound](https://wellfound.com/), etc.)
2. Make your target list (i.e., hiring managers). If the list is large, consider adding filters:
    - Only target managers (not directors or VPs)
    - In position for less than 2 years (they're still trying to prove themselves)
    - Geography (focus on where you want to work)
    - Target 1st-or-2nd-degree connections (when they look you up, they'll see some social proof)
3. Look up their email addresses (use something like RocketReach)
4. Outreach emails are not a job application (keep things informal)
    - You're trying to connect with a human being, not an ATS.
    - Don't be super focused on a specific position or team.
5. Write succinct, highly personalized emails (keep things brief)
    - Don't be overly formal, don't get their gender wrong, don't paste in a generic cover letter, and don't lead with buzzword soup.
    - Find common ground (convince the person your message is worth reading): reference a project they worked on or something else and show how what you have done or still do is relevant.
    - Sell yourself (convince the person that you're worth spending time on and that they'd be an idiot to pass up the chance to talk with you): what have you built, created, or done that most other people have not? What might cause them to think you're special or interesting?
    - Formulate a strong call to action (ask for a meeting or something else and eliminate ambiguity and suggest a concrete next step)
6. How long it takes 

    The following is a rough sketch at how long you can expect the communication phase to take:

    | Time | Description |
    | :-- | :-- |
    | 2 days | Create a target list |
    | 1 day | Write your first draft email template |
    | 3 days | Go through your target list and find personal tidbits about each target (e.g., blog posts) |
    | 2 days | Write outreach to the first batch |
    | 1 week | Wait for results so you can iterate on your outreach |
    | 2 days | Write outreach to the second batch |
    | 1 week | Wait for results so you can iterate on your outreach |
    | 2 days | Write outreach to the third batch |
    | 1 week | Wait for results so you can iterate on your outreach |

Several of the sectional highlights below expand on the different numbered points from above.

### Identify desirable companies to work at

Try to identify companies that you'd possibly be excited to work at beyond slapping down some FAANG names and moving on:

- Are there any dev tools that you really admire?
- Are there any open-source projects you follow?
- Are there any engineers you follow on social media whose work you admire?
- Look at where your friends work by combing through Facebook or LinkedIn or both. Reach out to them to ask what it's like (before you even ask for a referral).

Some [other resources](http://bctci.co/resources-to-find-companies) for finding companies:

- [Y Combinator's Work at a Startup.](https://www.workatastartup.com/) These are job listings specifically at Y Combinator companies. You can browse listings without having to go through a lengthy onboarding process, which is the downfall of many modern job boards/recruiting sites.
- The usual suspects: [levels.fyi](https://www.levels.fyi/?compare=Booz%20Allen%20Hamilton,Capital%20One,Microsoft&track=Software%20Engineer), [Glassdoor](https://www.glassdoor.com/Community/index.htm), and [Blind](https://www.teamblind.com/). On levels.fyi, you can search for companies that meet a certain, rough comp range. Glassdoor lets you look through employee reviews. And, of course, Blind is a frothy mix of gossip, angry rants, and uniquely useful insights about companies. But you never know which one you're going to get.
- [Remote Rocketship.](https://www.remoterocketship.com/?page=1&sort=DateAdded) Great and simple job board specifically focused on remote work. Same as the YC board, you can browse without having to create an account.
- [Wellfound](https://wellfound.com/) (formerly AngelList). This is a recruiting marketplace focused on startups but includes many very large, late stage startups as well (e.g., OpenAI). You have to go through a pretty lengthy onboarding process to be able to browse, though.

### Constructing succinct and personal outreach emails with three core components

Outreach emails are meant to be *informal*. Use the person's first name, and don't attach your resume &#8212; it's best to link to your LinkedIn or personal website. Also, *do not* include a ton of text with your whole life's backstory. Be succinct and be personal. 

Cold emails have three defining components:

1. **Common ground with your target:** Not every cold email will have common ground; there's simply not enough information out there about some targets to be able to craft a compelling narrative that's highly personalized to them.

    Reference something your target cares about, and then show your target that you care about it too or that your target helping you would fit into their worldview and further that cause. Some ways to do this: reference a project they worked on and the relevant work you've done; reference a controversial opinion they hold and affirm it in an authentic way.

2. **Proof that you're worthy of their time:** It is *your* job to sell yourself quickly and succinctly. You want your target to feel like they'd be an idiot to pass up the chance to talk to you.

    What have you built or created? Have you worked at a top company or attended a top school? Accomplishments should answer the following basic question: what have you done that most other people haven't? Some examples: A blog post you wrote about a technical topic did well on Hacker News, Reddit, or social media; something you built got some great press when your company announced its last funding round; you refactored a piece of code at work, and now it runs 100X faster; you won a company hackathon; you're a core contributor to a notable open-source project; something you built is being used by a number of other people.

3. **A strong call to action:** Ask for a meeting or something else.

    Usually this translates to asking for a meeting in the next week or two with a time that works for your target. 

## Chapter 8 {#c8}

### Do not reveal things unnecessarily during the recruiting phase

Do not reveal the following in the initial hiring phases: compensation history, compensation expectations, where else you're interviewing and where you are in the interview process.

### Questions to ask during recruiter call 

- What are each of the steps in the rest of the process?
- How long does it take to get through the process, on average?
- What to expect during the technical phone screen
  + Types of questions (Is it mostly data structures and algorithms or more practical?)
  + Tooling
- Components of the onsite
- The reasons that most candidates fail the technical phone screen and the onsite
- If it's a large company, ask what makes candidates get down-leveled and how often it happens
- Ask what you should be asking but aren't (this is a great question to ask at the end of all your interviews!)

Not asking the questions above is a mistake.

### The questions you ask have little sway over the outcome

> Ask questions. Learn something. Don't ask anything *bad*. That's it.

In other words: the questions you ask won't make or break your outcome. Unless you ask something outrageously bad. But it's not as if your asking a specific question will make hiring managers think they should give you a shot. Asking questions is legitimately mostly for your own benefit. Take advantage of it.

### Questions to consider asking

Favorites by the IIO team are marked with a `*`:

**Team caliber/culture**

- How long have you been here?
- `*` When you were last interviewing, what were some of your other options, and what made you choose this company?
  + This can be a hard question to ask because it's highly personal. And not everyone you speak to will have had multiple options. But hopefully, a few people did and chose the current company deliberately rather than because they had no other choice.
- What is the most fulfilling/exciting/technically complex project that you've worked on here so far?
- What is something you wish were different about your job?
- `*` How often have you moved teams? What made you join the team you're on right now? If you wanted to move teams, what would need to happen?
  + This is specific. We want to know exactly how your interviewer moved teams throughout their time at the company. We don't want to hear a platitude about how easy it is to get on new teams and learn new things.
- If the company is a startup: When was the last time you interacted with a founder? What was it regarding? Generally how involved are the founders in the day-to-day?

**Engineering**

- `*` What did your day look like yesterday? Was that typical? If not, what does a typical day look like?
- What is your stack?
- What is the rationale for/story behind this specific stack?
- How often do you add new tools to the mix?
- Do you tend to roll your own solutions more often or rely on third-party tools? What's the rationale in a specific case?
- What kind of test coverage do you have?
- Would you describe your engineering culture as more pragmatic or more theoretical?
- What portion of your time is spent working on new stuff vs. iterating on existing stuff?
- How long are your release cycles?
- What's the worst technical screw-up that's happened in the recent past? How did you and the team deal with it? What changes were implemented afterward to make sure it didn't happen again?
- `*` What is the most costly technical decision made early on that the company is living with now?
  + This is especially true at startups, many of whom live for years, or into perpetuity, with decisions a founder made on the fly in the early days!

**Product voice/visbility into the business side**

- What are you working on right now? How did that become the thing that you ended up working on?
- If you had an idea for something new to build, what would you have to do to make it happen?
- `*` What is some of the more meaty new stuff that got pushed in the last release? Where did the idea for that feature originate?
  + We like this one because, again, it's specific. We're not asking where product ideas generally come from &#8212; that invites platitudes about how everyone can contribute great ideas.
- `*` Who are the other major players in this space? What do you have that they don't?
  + The answer to this one can be useful for getting some idea of what the space looks like and what traction the company in question might have. Most importantly, though, it'll give you some insight into whether the people at the company care about the product and the business side of things or not and how much they've thought about stuff like this.
- If the company is a startup: How much runway is there? What milestones do we need to hit to raise the next round?

**Attrition**

- How long does the average engineer stay at the company?
- `*` Why have the last few people left \{on your team if it's a larger company or at the whole company if it's small\}?
  + Again, specificity for the win!

**Entrepreneurship**

Not everyone cares about entrepreneurship, and you don't have to! However, if you've been told that joining a given company is a stepping stone to starting your own because of the entrepreneurial habits that you'll learn, you'll want to validate that.

- `*` How many former employees have gone on to found startups?
- Was their leaving to do so generally looked on favorably?
- How does the company culture encourage entrepreneurship? Can you provide some specific examples?

## Chapter 9 {#c9}

### Planning company order (worksheet)

Use [this worksheet](https://bctci.co/job-search-worksheet-1) to enter all the companies you're considering, and IIO will help you determine the order in which you should approach them, to make sure your offers come in at the same time.

### Throwaway interviews at companies you don't care about is not a good use of your time

- The interview process for a throwaway company is likely quite different than for the company/companies you're interested in.
- Throwaway interviews don't give you much in the way of feedback. 
- Sometimes you end up settling because an offer was made and the job is there for the taking. Doing throwaway interviews can occasionally lead to real job offers that result in professional settling.

### How to balance interview practice with company outreach

How can you do both efficiently? There are roughly three scenarios (suggested roadmaps are included):

**Scenario 1 - You're not working and have at least six months of personal runway**

Minimize the overlap between prep and outreach to reduce context-switching.

<div align='center' className='centeredImageDiv'>
  <img width='800px' src={require('@site/static/img/bctci/c9/f3.png').default} />
</div>

**Scenario 2 - You're not working and need to find a job in the next few months**

If you have to do prep and outreach simultaneously, just know it's an uphill battle.

<div align='center' className='centeredImageDiv'>
  <img width='800px' src={require('@site/static/img/bctci/c9/f4.png').default} />
</div>

**Scenario 3 - You are working**

<div align='center' className='centeredImageDiv'>
  <img width='800px' src={require('@site/static/img/bctci/c9/f5.png').default} />
</div>

Notable points:

- Three weeks of dedicated outreach with no disruption (get used to writing cold emails and start iterating on your messaging)
- Learn and review material for 4 weeks on your own
- Starting in week 7, start doing 3 mock interviews per week, and spend the remaining time dedicated to solo practice to simulate the feel of a real interview
- Try to wrap up scheduling and recruiter calls before starting your technical interviews

### Getting an offer vs. leveling

This is a bit over-simplistic, but generally how you perform in algorithmic interviews determines whether you get an offer, and how you perform in system design (and often in behavioral) interviews determines how you're leveled.

### Don't be afraid to ask for a delay in scheduling your technical interview if you are not ready

Some things to keep in mind that are not usually common knowledge:

1. Recruiters don't *really* care when you interview. Though they'd prefer that you interview sooner rather than later so they can hit their numbers, at the end of the day, they'd rather be responsible for successful candidates than unsuccessful ones.
2. If you're interviewing at large companies, most engineering roles will be evergreen (i.e., they will always be around). Sure, perhaps one team will have filled their spot, but another one will pop up in its place.

In IIO's experience, they've never heard of a candidate regretting their decision to postpone an interview.

### Consult "air traffic control" section on speeding up or slowing down when appropriate

There are a lot of context-specific scenarios outlined in the [air traffic control](/docs/bctci/job-searches-start-to-finish/c9/#air-traffic-control---stalling-and-speeding-up) section for when and how to stall or speed up the interview process at different companies. Consult this section in more detail as appropriate.

### Questions to ask hiring managers specifically

(These are meant to be genuine questions since your relationship with your manager is a major predictor of your overall happiness at a company.)

For hiring managers to build rapport and gauge fit:

- Which project on the road map are you personally most excited about, and why?
- What can I do to minimize my onboarding time and become effective as fast as possible?
- What have been some failure modes for past hires? What are things I should make sure to avoid doing?
- What's your preferred mode of communication? Email? Messaging?
- If there are several project options when I join, which would help the team most for me to take on?
- There are even more questions you can ask in our list (pg 75).

For hiring managers to gauge when you have to *actually* make a decision by (regardless of what recruiters tell you):

- How many more people are you trying to hire for your team this quarter?
  + This is a specific question that hiring managers don't get that much and, as such, may not have a rehearsed response/will be more likely to answer honestly. Even if you don't get an answer to the next question, it'll give you some idea of how urgently you have to make a decision.
- From everything I've heard about your team and from getting to know you, I think it could be a great fit. That said, this is a decision I'm taking really seriously. I know you're talking to other candidates, but would you mind sharing when you think I'll need to make a decision by? I promise not to draw things out, but I want to make the best decision I can and then give 1 00% to the team I join.
  + This is really important. As we discussed above, you're much more likely to get honest answers from hiring managers than from recruiters.
- Would you be comfortable sharing your contact info (e.g., email) with me? I promise not to abuse it.

### Exactly what to say when trying to stall (and reasonable timeframes for different company profiles)

The table below shows how long you can typically stall as a function of company type and where you are in the process:

<div align='center' className='centeredImageDiv'>
  <img width='800px' src={require('@site/static/img/bctci/c9/f6.png').default} />
</div>

And here's what to actually say:

<div align='center' className='centeredImageDiv'>
  <img width='900px' src={require('@site/static/img/bctci/c9/f7.png').default} />
</div>

## Chapter 10 {#c10}

### What is total compensation (TC)?

Most offers in tech are comprised of four components: base salary, equity, signing bonus, and performance bonus. Adding them all up yields something called *total compensation* or TC.

### Brush up on equity compensation and stock options

[*The Holloway Guide to Equity Compensation*](https://www.holloway.com/g/equity-compensation) is an excellent resource, and [*An Engineer's Guide to Stock Options*](https://blog.alexmaccaw.com/an-engineers-guide-to-stock-options/) is also great. These resources will help you educate yourself about what all you're getting yourself into when it comes to compensation.

### Negotiation observations about components of offers in tech

- **Base salary:** Usually not a lot of wiggle room here &#8212; *maybe* you can sometimes haggle out a few more percentage points, but there's usually little negotiation room, especially compared to something like equity.
- **Equity:** If your company is private, then your equity is basically Monopoly money until there's a liquidity event such as an acquisition or IPO. If your company is public, then your equity has a real, tangible cash value: the stock price. Equity itself generally comes as either stock options or restricted stock units (RSUs). If you're awarded equity, then it is generally granted on a *vesting schedule*, which is a timeline (usually several years) on which your equity gets doled out. Employers are generally reluctant to hand you all your equity on day on because they want to create an incentive for you to stay as long as possible.

  Most companies do a four-year vesting schedule with a one-year cliff. This means that if you leave before the one-year mark, you don't get any equity. If you stay for a year or longer, you usually get your remaining equity in linear, monthly chunks (so 1/36th of the remaining stock every month ... because you already got the first 1/4th when you stayed for the first year). [...]

  You absolutely have to ask about the *liquidation preference*. Recruiters often don't know what it is, but it's something you must ask about. If it's anything above 1X, you should assume the odds of payout for you are slim.
- **Performance bonus:** Usually not negotiable and vary widely from company to company.
- **Signing bonus:** These are generally easier to negotiate, but they often come with strings attached (e.g., if you leave before 1 year has elapsed, then you have to pay it back).

### Questions about equity that are worth asking

Ask this ALWAYS:

- What's the vesting schedule?

If the company isn't public yet, ask these questions (doesn't matter what type of equity you're getting):

- What percent of the company am I getting (based on fully diluted numbers)? *Many recruiters won't share this with you, but you can't value your equity without it.*
  + As we said above, when you get an offer that includes stock options, it's usually presented as some number of options or possibly a dollar value. What that dollar value is based on is unknown. Some companies use the current valuation, but many use an aspirational valuation that they might have when they IPO. Either way, valuation will likely change over time, and you won't be able to reason about future value without knowing what your percentage ownership is. Giving you the number of options or the dollar value is like offering you some amount of money in a foreign currency without telling you the conversion rate. If a recruiter won't tell you the percentage you're getting, you can still get at it by asking:
- What is the number of fully diluted shares?
  + If you're given this amount, you can just divide your number of shares or options by the total amount of fully diluted shares to calculate your percentage ownership.
- What is the preferred price per share?
- What was the valuation of the company at the last funding round?
  + If you're given the valuation and the preferred price, you can divide them to figure out the number of fully diluted shares. Once you have that, you can calculate your percentage ownership.
Are there any liquidation preferences?
  + We discussed this above. If it's anything more than 1X, it's much less likely you'll ever see cash for your equity because investors are guaranteed to get paid out more than they put in. In other words, having a `> 1X` liquidation preference raises the bar on how high the sale price of the company has to be.

If your company is issuing restricted stock awards or options (i.e., not RSUs):

- Is it possible to early exercise and do an 83(b) election?
- If stock awards: What is the fair market value per share?
- If options:
  + What is the strike price?
  + What is the preferred price per share?
    * Multiplying the preferred price times the number of shares outstanding will give you the latest investor valuation.

If your company is issuing RSUs and isn't public:

- When is the IPO likely to be?
- How many more rounds of funding are expected before the IPO?
  + You can plug this information into our equity calculator to get a more accurate value.

## Chapter 11 {#c11}

### Always negotiate, especially early on when the stakes are low

Most people are uncomfortable with negotiations. The more you can snap out of the discomfort and become okay with negotiations ... the better! Early on the discomfort might only amount to a negligible quantity. But long term the amount can really add up.

### Effective negotiation largely amounts to effective preparation and leverage

Preparation and leverage means the following:

- Doing the work to make sure that you have multiple offers
- Ensuring all your offers come in at the same time
- Not tipping your hand too early
- Not sharing anything with recruiters until you're ready to negotiate
- Not negotiating before you're ready

## Chapter 12 {#c12}

### Two mistakes many engineers make at the beginning of their job search

The following mistakes are often made at the start of a job search, well before an offer has been made. Making these mistakes can prove costly:

- **Revealing information too early in the game:** Talking with recruiters is like being read your Miranda rights &#8212; anything you say can and will be held against you (you can't walk back anything you say in your initial conversations with a recruiter). Do not share the following with recruiters in the early stages: salary history, compensation expectations, where else you're interviewing, and how far along in the process you are with other companies. Basically: don't share *any* information about money or other interviews.
- **Negotiating before you're ready:** Ideally, you will have all offers in hand before you begin negotiating. You do not want to have to negotiate more than once with a single company.

### Your default mode with recruiters should be to listen rather than talk

Whenever you get on the phone with a recruiter (no matter the stage of the process): prioritize listening over talking. 

### Get comfortable not answering recruiter questions

You *do not* have to answer the questions recruiters send you. Don't be a jerk, but you never have to craft a point-by-point response to an email a recruiter sends you. Only send back a response that's advantageous to you. For example, it is perfectly fine to respond to a recruiter email like

> Hey `_____`,
>
> It was a pleasure speaking with you today. Can you please let me know where you are with your other opportunities and any onsites you have coming up in particular? Also, I'm working on scheduling your technical phone screen and will get back to you with details.

with a response like

> It was a pleasure speaking with you as well. I'm looking forward to next steps. I promise to keep you posted on any updates and will not accept any offers without discussing them with you first.

### What to say to recruiters at the beginning of the process

First, note that all of the snippets that follow end in essentially the same way: *I promise not to accept other offers until I have a chance to discuss them with you*. This is a great way to address recruiter concerns about losing you to a different company without directly answering their questions or providing them with details that they can use against you later (if you can speak to that worry head-on, there's not much they can say back).

```a title="For questions about comp expectations"
At this point, I don't feel equipped to throw out a number because 
I'd like to find out more about the opportunity first -- right now, 
I simply don't have the data to be able to say something concrete. 
If you end up making me an offer, I would be more than happy to iterate 
on it if needed and figure out something that works. I promise not to 
accept other offers until I have a chance to discuss them with you.
```

```a title="When a recruiter provides you a salary range and asks you to comment on it"
Thank you for sharing that with me. Right now I don't know enough 
about the opportunity to value it concretely, and I honestly haven't 
done my market research. If you end up making me an offer, I would be more 
than happy to iterate on it if needed and figure out something that works. 
I promise not to accept other offers until I have a chance to discuss 
them with you.
```

```a title="When asked about where else you're interviewing"
I'm currently speaking with a few other companies. I'll let you know 
if I get to the point where I have an exploding offer, and I promise 
not to accept other offers until I have a chance to discuss them with you.
```

```a title="Questions about timeline when it's advantageous to share (i.e., company is faster than others)"
I'm actively interviewing right now, and I expect to wrap up interviews 
in the next {n} weeks and then make a decision {m} weeks from now. 
How does that sound?
```

```a title="Questions about timeline when it's not advantageous to share (i.e., company is slower than others)"
I'm at various stages with a number of different companies, but based 
on what you told me, it sounds like there won't be any timing challenges. 
I promise to keep you posted if anything comes up.
```

### The best way to get more money is to get more offers

This is obvious on the surface, but the truth is that having competing offers is your primary source of leverage (if not your only source). Do your best to interview like hell and try to have all your offers coming in at the same time.

## Chapter 13 {#c13}

### What to say when a recruiter makes you an offer without a hard deadline

```
Thank you so much, and thank you for all your help with this process so far! 
This is really exciting! I'll need some time to process and talk 
to my {family, partner, spouse}. I will get back to you as soon as I can, 
and I may have some questions as well.
```

### What to say when you're given an exploding offer

```
Thank you so much, and thank you for all your help with this process so far! 
This is really exciting! I would very much appreciate having a bit more time. 
I'll need a bit of time to process and to talk to my {family, partner, spouse}. 
Know that I'm very excited about Company X. At the same time, choosing where 
I work is extremely important to me. Of course, I will not drag things out, 
and I will continue to keep you in the loop, but I hope you can understand 
my desire to make as informed of a decision as possible. 
How about I make a decision by ... ?
```

### What to say when you get compensation questions at the end of the process (instead of an offer)

```
It sounds like there's an offer coming, and I'm really excited about it. 
I'm not sure exactly what number I'm looking for, but if you'd be able 
to share what an offer package might look like, then I will gladly 
iterate on it with you if needed and figure out something that works. 
I promise not to accept other offers until I have a chance to discuss 
them with you.
```

### What to say when a recruiter provides a salary range and asks you to comment on it (instead of an offer)

```
Thank you for sharing that with me. I haven't done enough research to say 
definitively what I'm expecting. If you end up making me a concrete offer, 
I would be more than happy to iterate on it if needed and figure out 
something that works. I promise not to accept other offers until I have 
a chance to discuss them with you.
```

### What to say when you're asked about where else you're interviewing

```
I'm wrapping things up with a few companies and in process with a few more. 
I promise to keep you in the loop, and I promise not to accept other offers 
until I have a chance to discuss them with you.
```

## Chapter 14 {#c14}

### Negotiating with only a single offer is quite difficult

It's not necessarily impossible, but it makes things much more difficult. If at all possible, try to use the suggestions outlined in the previous chapters to do your best to have multiple offers on the table. That is how you can most effectively play companies off each other to secure as big of an offer as possible. Not bringing up other companies during the negotiation phase makes negotiation much more difficult.

### Reverse used car salesman (best strategy for a boom market)

This strategy assumes you have all offers in hand and are working within a boom market. Decide on which company you would like to work with most, and then approach this company in the following manner:

```
{I have 5 offers, including ones from Company X and Company Y/I have several strong offers} 
and am wrapping up the process with {Company M and Company Z/a few more}, 
but I'm really excited about this opportunity and will drop my other stuff 
and sign immediately if you can do the following:

Increase the base to X  [possibly 20% of offer]
Increase equity to Y    [1.5X the equity from your best competing offer]
Add a $Z signing bonus  [startup, seed stage: meaningful; startup past seed: 15%; large company: 25%]

Thank you so much, and I look forward to hearing from you. Hopefully, we'll be working together soon!
```

Why focus on equity, salary, and signing bonus instead of performance bonus or size of relocation package? Because these three elements of an offer are usually the only ones that really have much wiggle room. And you almost certainly won't get all three. You will probably get one or two, which is why you ask for three. And whatever they end up granting, it will almost always be in the middle between what they offered and what you asked for (this follows the "law of midpoints").

### The ladder (best strategy for a down market)

For the reverse used car salesman, you *started* by ranking your first choice and proceeding. Now, for the ladder, you'll make two sets of rankings: one based on your excitement about the company/role itself (if money were no object) and the other based on just the initial offer size. The other ranking will be by "best initial offer" in terms of TC for public companies and cash comp for startups.

So your two ranked lists could look like the following:

| # | Most Exciting | Best Initial Offer |
| :-: | :-- | :-- |
| 1 | Stripe | Google (\$302k) |
| 2 | Google | Stripe (\$270k; if we weren't including equity, it'd be \$220k) |
| 3 | Startup 1 | Bloomberg LP (\$202k) |
| 4 | Startup 2 | Startup 2 (\$197k) |
| 5 | Bloomberg LP | Startup 1 (\$165k) |

Now you can merge the lists together to form the ladder: the goal is largely to try to get comp ordered from highest to lowest while still being cognizant of how excited you are about those companies. Your merged list for the two lists above might look like the following:

| # | Merged List (aka the Ladder) |
| :-: | :-- |
| 1 | Google |
| 2 | Stripe |
| 3 | Bloomberg LP |
| 4 | Startup 2 |
| 5 | Startup 1 |

To use the ladder, we'll essentially negotiate the companies off each other, starting *from the bottom*.

### The deadline for an offer decision resets once you counter

This is true. Whenever you make a counteroffer, the clock resets on whatever deadline has been imposed. Why? Because your request likely has to be sent off to a compensation committee, which can take *weeks* to get a response.

### Negotiating with founders

It's a much more level playing field. You can say some of the same things but soften your tone. Founders take things much more personally and don't want to feel like you're wasting their time. Also, if they give a salary range, take them seriously. Equity is usually their main bargaining chip.

## Chapter 15 {#c15}

### Technical interviews outweigh behavioral interviews but behavioral interviews can sink you

If you have a fantastic technical interview but a poor behavioral interview, then it's quite possible you've tanked the possibility of getting an offer. On the other hand, if you have a poor technical interview but a fantastic behavioral interview, then there's likely no chance of an offer. Your technical interview must be solid. But don't neglect your behavioral interview. Sometimes it can make or break whether or not you'll receive an offer.

### Behavioral interview results are often used for leveling

Don't neglect your behavioral interview! Even if your behavioral interview result doesn't impact whether or not you get an offer, the result can often influence how you are leveled. 

### The most common reasons for failed behavioral interviews

Common reasons candidates fail behavioral interviews:

| Reason for failure | Frequency |
| :-- | :-- |
| Not using STAR method | 40% |
| Insufficient detail | 25% |
| Unprepared/too long to answer | 12% |
| Lack of conciseness | 6% |
| Not answering interviewer's question | 5% |
| Not articulating lessons learned | 5% |
| Not showing personal responsibility, humility, or empathy | 5% |

### Behavioral questions are NOT just casual conversation

An interview is an interview. Everything is being judged in one way or another, whether it's by an official rubric or by impressions made on the interviewer. The point is that what might typically be taken as "casual conversation" is anything but (before an offer has been made).

## Chapter 16 {#c16}

### Answering behavioral interview questions involves content (what to say) and communication (how to say) and it's easy to get either or both of those wrong

Consider the following classic behavioral interview question:

> Tell me about a challenging project you have tackled.

It's easy to find a starting place and then just *go*. But the problem is that this isn't a technical question. Your response is not something you get to iterative improve on. There is no rough draft. Whatever you respond with is your answer. Things can often go wrong with whatever answer you end up spitting out, specifically one of the following:

1. You had more challenging situations but didn't think of them. This is a fault in *preparation* (pg 164).
2. You thought of these other challenges, but didn't select the most relevant one. This is a fault in *selecting* (pg 144) and possibly dealing with *leveling* too (pg 150).
3. You picked a great challenge, but you failed to send a compelling message about what was truly challenging. This is a fault in *signal* (pg 141).
4. You said the right stuff, but your story was disorganized. This is a fault in *communication*; that's the next chapter (pg 154).

### What is signal and why does it matter?

Sometimes the answer isn't the answer and the question isn't the question. You can answer a question like the one above *literally* and check all the boxes in providing a complete answer and yet still completely miss the mark by not *actually* answering the *real* question. What is the real question?

A misguided, yet completely common, answer would involve you picking what you felt like was the most challenging project you've tackled and describing exactly what you did. But if that's it, then you've misunderstood the question and provided the wrong answer. This is where *signal* comes in &#8212; signal is not about *what happened*, it's about *who you are*.

Your answer should show that you are smart, persistent, creative, empathetic, scrappy, data-drive, thorough, etc. The stories you select to share should ideally demonstrate qualities about you, qualities that would make you a valuable employee and an asset for a team.

### Matching questions to signals is a useful skill to hone

Some specific kinds of behavioral questions such as the classic *Tell me about a time when you ...* are goal-oriented in the sense that the interviewer is trying to measure for a specific signal: your job is to deliver that signal to them.

For example, the following behavioral questions are commonplace in behavioral interviews, and it's helpful to match them to the signal(s) the interviewer is likely trying to measure in your response (note that there can be many signals in a single question and multiple ways to describe an attribute):

| Question | Signal |
| :-- | :-- |
| Describe a situation where you had to collaborate with a difficult team member. How did you handle it, and what was the outcome? | Empathy, conflict management, and ability to tailor communication or approach. |
| Tell me about a time when you disagreed with a decision made by your manager or team. How did you handle the situation? | Knowing how to speak up; influencing others; ability to understand other people's reasoning; knowing when to stop arguing. |
| Tell me about a time when you were working on a project that was behind schedule. | Prioritization; communication about challenges; time management |
| Tell me about a time when you made a mistake. | Ability to admit that you made that you made a mistake (really, that's the #1 thing); the self-reflection to learn from mistakes |
| Tell me about a time when you had to balance the needs of multiple stakeholders. | Empathy; communication; prioritization |
| Tell me about a time when you influenced an individual or team. | Empathy; ability to adjust communication and approach |
| Tell me about a time when you identified a performance issue in code. | Technical skills related to identifying performance issues and fixing them |

Takeaway: sometimes it's helpful to think about answering a question as not trying to come up with a story you think exactly matches what the interviewer is looking for but matching a response to a signal the interviewer is trying to pick up.

### What if you don't have a particularly noteworthy project?

The exact projects you have been on at work is not a set of experiences you often directly control. What interviewers are looking for, really, is for you to demonstrate *your skills*, technical or interpersonal.

### What makes a good project for good behavioral interview fodder and why?

| Desirable project characteristic | Description |
| :-- | :-- |
| **Recency and familiarity** | You should have worked on this project recently enough and at enough depth to be able to answer detailed questions about it. Your interviewer may ask you about tooling or about specific metrics. They may also change up constraints on the fly to see how you'd change your approach. If you don't remember details, you will fumble. |
| **Large contribution** | This should be a project where your part was meaningful. You want to give the interviewer enough for them to sink their teeth into and be able to discuss with you at length. |
| **Part of a team** | Ideally, you'll be able to talk about being part of a team &#8212; at least for most of your stories. Part of the intent of behavioral interviews is to suss out whether you're able to work well with others. At more senior levels, this would morph into working with several other teams or leading several teams. |
| **Difficult, open-ended task** | Your interviewer wants to know if you can thrive in ambiguous circumstances. The more uncertainty there was going into the project, the better, provided you're able to tell a story about how you tamed the chaos. |
| **Successes *and* failures** | Some companies, like Amazon, will explicitly ask about both success and failure stories; others don't care much whether your story ends happily. Optimize for the stories that demonstrate positive attributes about you (pg 141). If you do tell a failure story (and you absolutely should when asked about failures), be sure to talk about what you learned, and if possible, how you made it right or how you avoided similar mistakes. |
| **Signal-sending stories** | Interviewers are often looking for stories that demonstrate particular attributes, such as being adaptable, prioritizing the customer, or being data-driven. They are often related to the company's values. Especially if the company is known for doing values-based interviewing (e.g., Amazon and their Leadership Principles), we recommend looking up the company's values and identifying stories that demonstrate those attributes. |
| **Appropriate scope for the level you're targeting** | Use this interview as an opportunity to show your interviewer that you're already doing the job and thinking at the level of the role that you're applying for. We'll talk more about this in the upcoming section about leveling specifically. |
| **High visibility, if possible** | If you've worked on something high-profile, all other things being equal, choose that project. Your interviewer is human and not impervious to being impressed by projects that touch products they admire. However, don't choose high visibility projects at the expense of the other things on this list. If you had a negligible role in something impressive-sounding, for example, it's better to pick a more obscure project where you contributed meaningfully. |

### How many technical projects and stories should I come prepared to discuss in detail and what strategies should I use to identify them?

The book recommends having at least three technical projects and five stories that you feel comfortable discussing in depth (you should have one story from each job or section of your career). The note above shows how to strategically identify the *projects* but what about the *stories*? There are two notable stragies for brainstorming stories, and both strategies should be used (the general goal is to deftly balance quality and quantity):

- **Category-based generation:** accomplishments and challenges; leadership, influence, and decision-making; conflicts and collaboration; enjoyment and learning; mistakes and failures

  For each job or section of your career, fill out a matrix like the following one with just a few keywords per story (detailed accounts can come later &#8212; the main goal here to just generate ideas as to which stories you might provide):

  |  | TEAM 1 | TEAM 2 |
  | :-- | :-- | :-- |
  | **Accomplishments & Challenge** | API re-design | Backwards compatibility |
  | **Leadership, Influence, and Decision-Making** | Best: API re-design<br/>Backup: Documentation initiative | Integration Issues with client |
  | **Conflicts & Collaboration** | Security issue | Best: Backwards compatibility<br/>Backup: Mobile client |
  | **Enjoyment & Learning** | Analytics tools | Scalability |
  | **Mistakes & Failures** | Production outage | Security issue |

- **Signal-based generation:** strengths, weaknesses, and values

  When a candidate generates a story by *starting* from a signal, that story generally does a good job of demonstrating that signal. For each job, team, or section of your career, you should be able to generate a story that starts from each of the following signals: your strengths (your actual strengths, which should be reinforced through technical stories), your weaknesses (of course, don't provide anything too damning, but pinpointing your actual weaknesses can naturally serve as a springboard into stories about mistakes and failures), and the company's values (show that you value what your company values).

  Make a list of your strengths and weaknesses, along with the company's values, and put them into a matrix like the following (stories can overlap; you don't have to have a different story for each signal):

  |  | TEAM 1 | TEAM 2 |
  | :-- | :-- | :-- |
  | **Strength 1: Persistence** | Mobile redesign | Integration issues with client |
  | **Strength 2: Data-driven** | Analytics tools | Backwards compatibility |
  | **Strength 3: Influence** | API Re-design | Security issue |
  | **Weakness 1: Blunt** | Teammate feedback reaction | Load screen redesign |
  | **Weakness 2: Impulsive** | Production outage | Mobile client |
  | **Value 1: Customer-driven** | Mobile redesign | Backwards compatibility |
  | **Value 2: Mentorship** | Junior engineer/PIP | Integration issues with client |
  | **...** |  |  |

### What are the primary mistakes that engineers make in their behavioral interviews that cause them to get down-leveled?

The book indicates the following:

| Reason for down-leveling | Frequency |
| :-- | :-- |
| Not showcasing conflict resolution skills/inability to work with difficult people | 37% |
| Not matching stories/project scope to seniority level | 21% |
| Not talking about process-level improvements | 17% |
| Not enough examples of giving mentorship | 12% |
| Not thinking about long-term impact of their choices/solutions | 4% |
| Not good at delegating | 4% |
| Not talking about how they are/would be a force multiplier | 4% |

### How can I determine whether or not the project I've chosen to discuss is a good project for a behavioral interview (self-quiz)?

You should target a score of at least 5 of a possible 7 from the following list of questions:

- [+1 Point] Can you clearly articulate the impact that you made, preferably with numbers?
  + [+1 Point] Did the project have well-defined metrics?
    * [+1 Point] Did you come up with the metrics?
- [+1 Point] Did you make any meaningful architectural decisions as part of this project?
- [+1 Point] Did you advocate for putting in some kind of process or some changes that made future projects better?
  + [+1 Point] Were you able to actually implement said process?
- [+1 Point] Do you remember this project in enough detail, to the point where you'd be comfortable answering in depth if your interviewer asks about what you would have done if some constraints were different?

### What if I'm aiming for more of a managerial role than an individual contributor (IC) role?

If you're applying for your first managerial position, use the questions and points from above and also add the following. For the previous section, you want at least 5 out of 7. For this section, you want a score of at least 2 out of 3.

- [+1 Point] Were you instrumental in resolving conflict on your team?
- [+1 Point] Did you take on an unofficial leadership role as the project went on?
- [+1 Point] Can you demonstrate, through this project, that you're a force multiplier?

## Chapter 17 {#c17}

### What is the STAR method and why is it effective?

TLDR: It's a framework that helps you discuss your past work in a way that makes sense to interviewers who lack context about your project(s):

- Situation
- Task
- Action
- Result

Suppose your interviewer asks you the following common question: *Tell me about a time when you fixed a problem at work.* A non-STAR response might look like the following:

> Sure, I did some pretty significant optimizations to some backend code at work. To start, I used SQL Profiler to analyze query execution times and identified a query that was causing performance issues due to inefficient indexing. I revised the query to use proper joins and ensured that frequently accessed columns were indexed appropriately. Alongside this, I used pgAdmin to review the database schema and optimize table structures where necessary.
>
> Once the optimizations were implemented, I utilized our in-house testing framework to validate functionality and JMeter to perform load testing under simulated peak traffic conditions.

Largely forgettable, right? Not compelling even though technical keywords are buzzing. But it's really lacking the *story*. The STAR method helps flesh things out clearly (paragraphs below cleanly correspond to S, T, A, and R, for ease of illustration):

> In a previous role, I observed that a backend feature responsible for serving high-traffic user data was experiencing noticeable slowdowns during peak usage periods. This feature was critical for delivering real-time information to thousands of users, and its inefficiency was beginning to impact the overall user experience.
>
> Although this wasn't directly assigned to me, I decided to investigate the issue, as it was a critical part of the user experience.
>
> I began by analyzing query performance using SQL Profiler, which revealed that a key database query was poorly optimized and relying on a full table scan. Diving deeper, I identified that the lack of appropriate indexing on certain columns was a significant bottleneck. I studied our existing database schema and implemented changes to optimize table structures and indexing strategies. Additionally, I rewrote the query to use more efficient joins and reduced redundant calculations. After making the updates, I rigorously tested the system using our internal testing framework to ensure functionality remained intact, and conducted load testing with JMeter to simulate peak traffic conditions.
>
> This demonstrated that the optimizations reduced query execution time by nearly 50%. The feature's response time improved noticeably, leading to smoother user experiences. The changes not only resolved the immediate performance issues but also encouraged a broader initiative within the team to audit and optimize other critical queries.

This second way of describing things not only tells a story but a particular type of story &#8212; it also teaches the interviewer not only what you did but also why it mattered. The STAR method is an efficient and effective way to keep your response on track while also improving their perceived impact.

### What is the "S" in the STAR method?

*Situation*. The goal here is simple but easy to screw up: *set the stage*. Your goal is to provide just enough information that the rest of your story makes sense. You have to strike a balance. If you don't set the stage, then the rest of your story won't make any sense. But if you provide too many details, then you can get bogged down and lost and your story won't have any impact.

Your goal is to be brief and provide just enough context so the interviewer can understand why the issue you're about to discuss is important.

### What is the "T" in the STAR method?

*Task*. It's easy to confuse this with either the situation or the action, but just remember: The *situation* describes the problem, and the *action* describes the implementation details. The *task* is what connects the situation to the action. And it's generally very short, one or two sentences, where its purpose is to very briefly outline the goals, constraints, and/or chosen solution.

The actual way you include the specific task should look something like the following:

> \{Describe your solution to the problem you posed in the Situation portion above\}
>
> *In order to solve this problem, we decided to [insert solution description here].*
>
> \{If it makes sense to, you should also explain why you chose this solution, possibly over others.\}
>
> *We thought this was a good solution because [insert reason here].*

Whatever you do, it's critical that you make the task part clear to the interviewer; otherwise, your actions won't make any sense. Just like with the situation, effectively sketching out the task is a *balancing act* &#8212; you don't want to gloss over things so much that your actions don't make sense, but you also don't want to get too buried in the details so that your interviewer loses track of the actual problem.

### What is the "A" in the STAR method?

*Action*. This is what you actually did, *how* you solved the problem as well as your individual contributions to the solution if you were working in a team.

> \{Break down your actions into several components. This might be different phases of the project, different steps, different attempts, different challenges, etc. Usually about three pieces is a good goal.\}

### What is the "R" in the STAR method?

*Result*. This is where you talk about what happened after you did the Task and Action. Did it succeed/fail? How did you define success/failure? How did you and the team grow from this experience? What was the overall business impact? Etc.

Be prepared to be introspective here. What could you have done better? What did you learn? How will this change your day-to-day practices moving forward? Etc.

### Behavioral answer matrix

For *each* project or story, fill in the cells below (just use keywords/bullets, not word-for-word accounts):

|  | PROJECT/STORY 1 | PROJECT/STORY 2 | ... |
| :-- | :-- | :-- | :-- |
| **Situation** |  |  |  |
| **Task** |  |  |  |
| **Action** |  |  |  |
| **Result** |  |  |  |
| **Signals** |  |  |  |
| **Learnings/Improvements** |  |  |  |

Here's an example:

|  | ANSWER 1 | ANSWER 2 |
| :-- | :-- | :-- |
| **Situation** | Inconsistent crashing, usually during peak hours. Couldn't repro in test. | Requests for dark mode. Hard b/c legacy codebase didn't support dynamic themes |
| **Task** | Fix bug ASAP. Added pressure from holiday season. | Make dark mode; ensure compatibility; time constraints |
| **Action(s)** | Analyze logs<br/>Rapid rearchitecture<br/>Bigger rebuild later | Reviewed codebase<br/>Create theme manage system<br/>Collab with QA +UX for testing framework |
| **Result** | Stable for future. Sales up 15%<br/>Improved automation for future | Launched on schedule<br/>40% adoption<br/>Became basis for future work |
| **Signals** | Technical competence<br/>Finding compromises<br/>Prioritization | Thoroughness<br/>Technical competence<br/>Collaboration |
| **Learnings/Improvements** | Proactive testing | Consult earlier engineers earlier on |

For *signals*, detail what the project or story demonstrates about you in terms of desirable signals you want to show. For *learnings/improvements*, take the proactive step in preparing for inevitable follow-up questions from interviewers about your projects and stories.

## Chapter 18 {#c18}

### How do I actually begin my job search before immersing myself in the "study" part?

The entire job search, start to finish, is outlined starting on page 82 in the book. Different suggested schedules are included:

**Not working and have at least 6 months of runway:**

<div align='center' className='centeredImageDiv'>
  <img width='800px' src={require('@site/static/img/bctci/c9/f3.png').default} />
</div>

**Not working and need to find a job in the next few months:**

<div align='center' className='centeredImageDiv'>
  <img width='800px' src={require('@site/static/img/bctci/c9/f4.png').default} />
</div>

**You are working:**

<div align='center' className='centeredImageDiv'>
  <img width='800px' src={require('@site/static/img/bctci/c9/f5.png').default} />
</div>

### If tier 1 topics are foundational, tier 2 topics are common but often depend on foundational topics, and tier 3 topics are niche topics, then what topics are in each tier and what other topics exist?

The book's approach to labeling topics is somewhat heavy-handed and hand-wavey, but here's the tiering system they've used in all its glory:

| Tier | Topic | Description |
| :-: | :-- | :-- |
| **1** |  | Topics that arise most frequently in interviews and are foundational for other topics. These topics should be studied first. |
|  | Dynamic arrays |  |
|  | String manipulation |  |
|  | Two pointers |  |
|  | Grids and matrices |  |
|  | Binary search |  |
|  | Sets and maps |  |
|  | Stacks and queues |  |
|  | Recursion |  |
|  | Sorting |  |
|  | Linked lists |  |
|  | Trees |  |
|  | Graphs |  |
| **2** |  | Important topics that are common in interviews but less foundational. |
|  | Heaps |  |
|  | Sliding windows |  |
|  | Backtracking |  |
|  | Topological sort |  |
|  | Prefix sums |  |
|  | Dynamic programming |  |
|  | Greedy algorithms |  |
| **3** |  | Niche topics. You're largely unlucky if you get one of these (`< 20%` frequency in interviews). |
|  | Monotonic stacks and queues |  |
|  | Union-find |  |
|  | Data structure design |  |
|  | Set and map implementations |  |
|  | Tries |  |
|  | Graphs (advanced) |  |
|  | Dynamic programming (advanced) |  |
|  | Bit manipulation |  |
|  | Math |  |
| **4** |  | Not even listed in the book for whatever reason (possibly far too narrow or specialized or *extremely niche*). |
|  |  |  |

### What are the two phases of the study plan for coding interviews?

- Phase 1 is to actually learn the material (the topics in the catalog). Can't do much when you don't know anything!
- Phase 2 is all about interview simulation (on your own at worst, with an actual mock interviewer at best)

### What is the most classic mistake candidates make when preparing for interviews?

Practicing too much at the expense of outreach. Some interview processes can take months. Of course, you need to know some things before you start interviewing, but it's a mistake to grind alone forever before reaching out to actually interview.

### What is generally the best way of going about practicing problems to reinforce learning?

*Interleaved practice*. Don't just do problems for one topic at a time. That's good for when first learning a topic. But to *master* different topics, you should *interleave* problems. This prevents you from knowing at the outset which problem-solving approach is optimal, something that obviously happens during real interviews.

You can use [IIO's AI interviewer](https://start.interviewing.io/interview-ai) on shuffle mode to simulate interleaved practice. Another good way is to do LeetCode's "problem of the day".

### How should I approach practice problems dearing the "learning phase" (phase 1)?

The following guidelines will help you get the most out of practicing problems during the learning phase:

- **Don't fixate on time spent per question:** Time management matters but not as much in phase 1. Never spend longer than 1 hour on a problem though.
- **Focus on ideas, not code:** Don't get stuck on bugs. At the 1 hour cap? Stop. Use an AI chatbot to help you spot the bug. Look at the work by others. Iterative improvement is important in both phase 1 (learning) and phase 2 (interview simulation), but phase 1 demands *faster* iterations.
- **Don't neglect postmortems:** These can be extremely high-yield if you're willing to put in the work. Don't neglect these. During your self-debrief, some of the highest-yield things you can do is reflect and add items to your cheat sheet and/or bug list. This will be informed by practice.

### How can I expect phase 2 (interview simulation) to be different from phase 1 (learning)?

Necessarily, the act of *interviewing* with another human being requires a different approach in how you communicate, code, and test your solution. The idea once you move to phase 2 is to keep doing interleaved practice but now you want to practice under conditions as close as possible to the real thing.

### How can I simulate the interview setting as closely as possible when doing a practice problem?

Three things:

- **Time management:** Only give yourself 45 minutes to complete the problem no matter where you end up.
- **Universal rubric:** Once you are done with the problem at hand, evaluate yourself as an interviewer would using the universal rubric, where you are graded on a scale from `0` to `5` in the following categories: problem-solving, coding, verification, and communication.
- **Interview checklist:** Get in the habit of forcing yourself to walk through the "interview checklist" for each problem you do:

  <div align='center' className='centeredImageDiv'>
    <img width='700px' src={require('@site/static/img/bctci/c20/f1.png').default} />
  </div>

### Pro tip - schedule inputs, not outcomes

Realistically, you can't schedule something like "learn dynamic programming" and hope to have it completed in an hour. Similaraly for something like "do 1 practice problem". What you *can* do is schedule the *input*: Devote an hour to learning about dynamic programming. Devote an hour to working on a practice problem. Etc. Thinking of your time devotion as an input and being okay with a non-deterministic output is a healthy and thoughtful way of going about scheduling your time.

### How should I go about preparing for a system design interview?

That's a little bit outside the scope of <BibRef id='bctci' pages=''></BibRef>, but it's still an important consideration to make when preparing for interviews. You really need to devote more long-range time and attention to the field of system design. Retention plays a bigger role than with DSA interviews.

Mock interviews with senior engineers is your highest-yield way to study, but mock interviews with an AI chatbot is much more affordable. Here's a prompt you can use to get started on a system design round with an AI chatbot:

```a title="AI chatbot prompt for practicing a system design round"
As a senior/staff engineer, you are conducting a system design interview.

Your task is to guide the candidate through a popular system design question in a step-by-step manner.

Follow the structure below for the interview:

1. Question Selection: Choose a popular system design question to ask.
2. Requirements: Discuss both functional and non-functional requirements.
3. High-Level Design: Guide the candidate to create a high-level design.
4. Detailed Design: Go into more detailed components such as data flows, APls, storage, etc.
5. Scaling Considerations: Address scalability and performance optimization.
6. Conclusion: Summarize the design and provide feedback or suggestions for improvement.

Please start by selecting a popular system design question to ask.
```

In terms of readings, DDIA and IIO's [A Senior Engineer's Guide to the System Design Interview](https://interviewing.io/guides/system-design-interview) are highly recommended.

## Chapter 19 {#c19}

### Casting a wide net in your job search is better than aiming for a single "dream" company

A lot of big tech companies operate in a similar manner when it comes to interviews. Sometimes you can simply get unlucky with interviewing at your dream company. It's best to try to prevent such a thing, if it happens, from being devastating. The insights fleshed out in this chapter apply to most big tech companies and their interview processes as opposed to being targeted to any company in particular.

### What are the four primary components that comprise the universal rubric?

1. Problem-solving
2. Coding
3. Verification
4. Communication

### What signal is the interviewer trying to pick up on from each part of the universal rubric?

1. **Problem-solving:** *Smart*. This largely comes through practice and your ability to figure things out more and more quickly.
2. **Coding:** *Hygiene*. You need to show that you can seamlessly translate your ideas into efficient, idiomatic code.
3. **Verification:** *Requirement-gathering* (beginning) and *correctness-testing* (end). Clarifying questions and edge cases should be detailed at the beginning before any code has been written. Additional test cases and examples should be used to verify the correctness of your solution at the end.
4. **Communication:** *Collaboration*. What are you like to collaborate with?

### What kinds of questions are asked in the PROBLEM-SOLVING part of the rubric?

Remember that the problem-solving portion of an interview is meant to determine how effectively you can *figure something out*, not regurgitate a bunch of memorized facts. It's truly about the journey, not the destination (at least with an effective interviewer). That said, the following questions are the ones interviews will likely answer after interviewing you:

- How much difficulty did they have finding an algorithm and optimizing it, relative to the difficulty of the problem?
- How much help did they need, relative to other candidates?
- Did they discuss tradeoffs in terms of the time and space complexity?
- Did they use appropriate data structures and algorithms to solve the problem?

### What kinds of questions are asked in the CODING part of the rubric?

- Could they translate their ideas into correct code?
- Did they overcomplicate the logic?
- Did they demonstrate good coding hygiene (clear variable names, abstracting relevant code into reusable helper functions instead of copy/pasting, consistent and reasonable style, etc.)?
- Is the code well organized and idiomatic to the language used?
- Did they demonstrate internalized software engineering principles?

### What kinds of questions are asked in the VERIFICATION part of the rubric?

- Did they ask good clarifying questions (that weren't already answered in the question description or examples)?
- Did they proactively consider edge cases?
- Did they test their code or provide a good argument for its correctness?
- Were they able to spot and fix any bugs?

### What kinds of questions are asked in the COMMUNICATION part of the rubric?

The goal here is largely to get a sense of what you would be like to collaborate with. Questions interviewers will be expected to answer after interviewing you:

- Were they able to clearly communicate their thoughts, even when the conversation got technical?
- Were they able to answer technical questions?
- Were they open to feedback?
- If they were confused, were they able to articulate why?

### What are some tips to improve communication signal?

- Keep your interviewer in the loop. Even if you need to quietly think for a moment, tell your interviewer this instead of just going silent.
- Showcase your depth of knowledge by intelligently using computer science terminology in your discussion. 
- Be a responsive listener. Be willing to pivot based on input from your interviewer.

## Chapter 20 {#c20}

### What six overarching steps comprise the "interview checklist"?

1. Understand the problem
2. Design the algorithm
3. Explain the solution
4. Get buy-in
5. Code the solution
6. Verify the solution

### What comprises or characterizes each step of the interview checklist?

- **Understand the problem**
  + Read the statement (twice)
  + Work through examples out loud
  + Ask clarifying questions
    * Edge cases
    * Input/output format
    * Scale constraints
- **Design the algorithm**
  + Minimally sketch naive solution
  + Identify upper and lower bounds
  + Look for triggers
  + Employ boosters (brute force optimization, hunt for properties, decrease the difficulty, cycle throug the Catalog, articulate your blocker)
- **Explain the solution**
  + Examples
  + Indented English
  + Name and justify
- **Get buy-in**
  + The magic question
- **Code the solution**
  + Main logic
  + Helper functions 
  + Stop if you get lost
- **Verify the solution**
  + Top-to-bottom pass
  + Tricky expressions
  + Run through with tiny input
  + Check edge cases
  + Verify analysis

### What's the best way to handle the opening chit-chat portion of a technical interview?

Simple: follow the interviewer's lead. You don't want to come across as terse or rude. But you also don't want to waste time meant for your technical assessment. In general, follow the interviewer's guidance and guage how you should respond based on the specific interviewer.

### How should I go about drawing within an editor?

As always: it depends on what you are drawing! But the following general principle is helpful: keep it simple. Don't try to be fancy. The goal is clarity of communication, not how pretty your drawings are.

**Arrays (with left and right pointers)**

<CodeGrid>
<CodeGridCell>

```a title="Fancy drawing"
[3, 5, 9, 2, 10, 8, 12, 1]
    ^            ^
    |            |
   left        right
```

</CodeGridCell>
<CodeGridCell>

```a title="Effective drawing"
3 5 9 2 10 8 12 1
  l
           r
```

</CodeGridCell>
</CodeGrid>

**Trees**

<CodeGrid>
<CodeGridCell>

```a title="Fancy drawing"
             2
          /     \
         5       8
        / \     / \
       3   9  10   12
                    \
                     1
```

</CodeGridCell>
<CodeGridCell>

```a title="Effective drawing"
                2
        5               8
  3          9    10        12
                                1
```

</CodeGridCell>
</CodeGrid>

### How can I stay calm under pressure when I feel stuck?

This is where the "boosters" come into play. Essentially, the following strategies should be pursued, roughly in order:

1. Brute force optimization.
2. Hunt for properties.
3. Decrease the difficulty.
4. Cycle through the Catalog.
5. Articulate your blocker.

### How can I effectively communicate with the interviewer as I design and narrate my solution/algorithm?

There's necessarily some overlap and concurrency between architecting and narrating your solution(s)/algorithm(s). But you need to keep your interviewer in the loop and do so effectively. This usually involves three techniques:

1. **Indented English:** Sort of like pseudocode but even less formal.
2. **Use examples to illustrate ideas:** These can either be the ones you are given or ones you come up with on your own.
3. **Name-and-justify:** Whenever you use an algorithm, data structure, or technique, it's important you not only name it but also that you justify why you chose it. Doing so sends positive signal to your interviewer.

### What does "indented English" really mean?

It means sketching out very high-level solution approaches, including the time and space complexity. It helps you get a sense of what the code would look like but without all the syntactical fluff. For example, here's an example of algorithms in indented English that you could use for the classic 3-sum problem:

<CodeGrid>
<CodeGridCell>

```a
Algo 2: Using a set
T: O(n^2)
S: O(n) extra space
put all values in a hash set
for each number x
    for each number y after x
        z = -(x + y)
        if x, y, z are different and z is in the set
            return true
return false
```

</CodeGridCell>
<CodeGridCell>

```a
Algo 3: binary search
T: O(n^2 log n)
S: O(1) extra space (modifies input)
sort the input array
for each number x
    for each number y after x
        z = -(x + y)
        if x, y, z are different and binary_search(z) is true
            return true
return false
```

</CodeGridCell>
</CodeGrid>

### How can I get interviewer buy-in with the "magic question"?

It's important not to immediately jump into coding once you've architected and narrated your solution. Coding requires consent! You need the interviwer to grant you permission to start coding. You need buy-in. The following "magic question" is effective at diagnosing whether or not you have buy-in:

> I would like to use `<X algorithm>` with `<Y time>` and `<Z space>` to solve the problem. Should I code this now, or should I keep thinking?

This gives the interviewer a chance to correct you in a way that is not hint-like; that is, after communicating your solution/algorithm in the previous steps, you are not asking for a hint on how to deduce a solution to the problem &#8212; you're merely asking whether or not the interviewer would like you to start coding.

### How should I go about actually coding up my solution?

The main advice is to **write top-down, not bottom-up**. That is, structure the code as a single function comprised of the overall logic. Write out the main logic first, using yet-to-be-written helper methods for smaller, self-contained bits of code that get in the way of the main algorithm. Why? Because the interviewer most wants to see the main logic of your solution &#8212; there's a decent chance you will need to change course slightly and alter your outline of helper functions and so forth.

The following is a perfectly reasonable skeleton of an initial top-down coding block:

```python
def invert(expression):
    if not expression:
        return -1
    min = get_min(expression)
    max = get_max(expression)
    count = 0
    for v in range(min, max):
        count += search(expression, v)
    return count
```

### Should I talk with my interviewer while I code my solution?

Up to this point, it's imperative that you've explained your thoughts and have gotten buy-in to your approach. So it's quite possible that you could be completely silent during the actual coding portion, and many interviewers would be fine with that.

A good rule of thumb: if you're not coding, you should be describing what you're thinking. Ideally, you should describe what you're about to do after each logical step. For example:

- "First, we will loop through the matrix, searching for the first occurrence of a one."

  `<code>`

- "Now, we need to start the depth-first search if the located one isn't in our visited set"

  `<code>`

Communicating like this helps you and the interviewer. Whatever happens, you don't want to get stuck writing out the code and the interviewer have no idea what you're trying to do. That's good for no one.

### What should I do if I find a bug in my solution when going through the verification phase?

Breathe. This is not ideal, but it is normal. The most important thing is to avoid hotfixes that can lead to a death spiral. Actually think about why the bug occurred, how it originated, and what the best approach would be to fix it. Applying a fix in the heat of the moment (i.e., a hotfix) can lead to more hotfixes that are incorrect, and all of that can lead to the death spiral that tanks the interview. Try to avoid that.

## Chapter 21 {#c21}

### Why is big O so important?

It's important because big O measures *performance* and performance dictates *optimality*, which is what coding interviews are all about. It's not about just eeking out a solution to a given problem &#8212; it's about analyzing that problem and coming up with a performant solution. Realistically, big O should be something that's always there running in the background, guiding design decisions, evaluating tradeoffs, etc.

### Why is big O actually more convenient than it sounds at first?

At first, big O sounds scary because it involves mathematics. And it can get scary in certain circumstances. But the goal of using big O is ultimately to *simplify* analysis. Analyzing algorithms with big O is powerful because doing so gives us a very broad picture of an algorithm's scaling behavior that is both easy to calculate and communicate.

Highlights that underscore the utility of big O:

- Unaffected by execution environemnt (it can be massively complicated to calculate performance if the finer details of the execution environment have to be taken into account)
- Algorithmic efficiency can be measured just by thinking about the approach instead of coding everything up and then measuring efficiency (this saves a ton of development time)
- Big O, as opposed to big Omega/Theta, looks at what can happen in the worst case, which means our efficiency calculations apply to *all* inputs
- Scaling behavior becomes more apparent with big O (we look at the long-term behavior, not the short-term)

### What are the two primary rules for simplifying complexity classes?

1. Drop additive and multiplicative constants
2. Drop non-dominant additive terms (not multiplicative terms)

### What are the common complexity classes you are likely to come across in an interview setting and what is their hierarchy?

The truth is that there are *infinitely* many complexity classes, some of which can be monstrously complex. But the point is that there's only a handful of common complexities you are likely to come across:

| Complexity class | Notation | Description | Examples |
| :-- | :-- | :-- | :-- |
| **Constant** | $O(1)$ | The growth rate does not depend on the input. | $18$<br/>$3\times 3\times 3$<br/> $10!$<br/> $\min(n,10)$ |
| **Logarithmic** | $O(\log n)$ | Very slow growth rate. When the input doubles, the value only increases by a constant: $O(\log (2n)) = O(\log 2\times \log n) = O(\log n)$ | $\log_2(n)$<br/> $\log_3(n)$<br/> $6\times \log_2(2n + 1)$ |
| **Linear** | $O(n)$ | When the input doubles, the value at most doubles: $O(2n) = O(n)$. | $n$<br/> $n/10$<br/> $3n + 5$<br/> $n + \log_2(n)$ |
| **Linearithmic** | $O(n\log n)$ | Slightly faster growth than linear. When the input doubles, the value grows by a bit more than double: $O((2n)\log(2n)) = O(2\times n\times \log(2)\times\log (n)) = O(n\log n)$. | $7n\times 3\log_2(n)$<br/> $n\times \log_2(n) + n$ |
| **Quadratic** | $O(n^2)$ | When the input doubles, the value at most quadruples: $O((2n)^2)) = O(2^2\times n^2) = O(4n^2) = O(n^2)$. | $n(n-1)/2$<br/> $1 + 2 + 3 + \cdots + n$ |
| **Cubic** | $O(n^3)$ | When the input doubles, the value grows at most eight-fold: $O((2n)^3) = O(2^3\times n^3) = O(8n^3) = O(n^3)$. | $n^3 + n^2\times\log_2(n)$ |
| **Exponential (base 2)** | $O(2^n)$ | Extremely fast growth rate. When the input grows by one, the value can double: $O(2^{n+1}) = O(2\times 2^n) = O(2^n)$. | $2^n$<br/> $2^{n+1}$<br/> $2^n + n^2$ |
| **Exponential (base 3)** | $O(3^n)$ | Extremely fast growth rate. When the input grows by one, the value can triple: $O(3^{n+1}) = O(3\times 3^n) = O(3^n)$. | $3^n$<br/> $3^{n+4}$<br/> $3^n + 2^n$ |
| **Factorial** | $O(n!)$ | Even faster growth rate. When the input grows by one, the value gets multiplied by a factor that increases each time: $O((n+1)!) = O((n+1)\times n!)$. | $n! + n!$<br/> $1\times 2\times 3\times\cdots\times n$ |

### Why is it not a problem for big O analysis if we have two or even more variables instead of just one?

For most problems, you'll be dealing with $n$, where $n$ represents the length, size, or whatever metric of something that is *one*-dimensional. But several problems require dealing with *multiple* dimensions, where two or more variables are required (e.g., rows and columns in a matrix). We must analyze our algorithm's efficiency to understand what happens as *all* variables scale.

Fortunately, we can still use the two rules mentioned previously to simplify complexity analysis no matter how many variables we have. For instance:

- $f(a, b) = 3a + b/2 + 1 = O(a + b)$, and
- $f(a, b) = a\cdot b^2 + a*b = O(a \cdot b^2)$ because $b^2$ dominates $b$, so $a\cdot b^2$ dominates $a\cdot b$.

The important thing to remember is that we don't assume that the two (or more) variables have the same value. For example, even if you have $f(a, b) = a! + b$, you cannot simplify it to $O(a!)$; you need to say $O(a! + b)$ because $b$ could be the dominant term when $b$ is much larger than $a$.

### Why is using big O in tech interviews actually somewhat of a misnomer?

The reason is because it's often trivial to pick an upper bound for something. If all we had to do was find an upper bound for an algorithm, then we could simply say most algorithms are $O(n!)$ and call it a day. But that's not the goal. In reality, we are often looking for the *least* upper bound so that the upper bound for our algorithm is "tight". Hence, technically, it makes more sense to talk about searching for an algorithm's big $\Theta$, which is analogous to an equals sign (where the lower bound and upper bound are in the same complexity class). But the industry is so entrenched in how big O has been used, it would arguably confuse matters if you started talking about big $\Theta$.

### Why is it imperative that we identify the input variables for an algorithm before trying to identify time and space complexities?

Because it's impossible to identify those complexities if you don't! Saying something is $O(n)$ without identifying what $n$ is (i.e., what the linear dependence is actually on) is totally useless.

### What is the practical meaning of a logarithmic expression like log_a(n)?

To answer what $\log_a n$ evaluates to, we need to ask ourselves how many times $n$ must be divided by $a$ in order to equal $1$. Why is this? It will be easier to see why if we let $b$ denote the value $\log_a n$:

$$
\begin{align*}
\log_a n = b
&\implies n = a^b & \text{(definition of logarithms)}\\[1em]
&\implies \frac{n}{a^b} = 1 & \text{(divide both sides by $a^b$)}\\[1em]
&\implies \frac{n}{\underbrace{a\times a\times\cdots\times a}_{\text{$b$ times}}} = 1 & \text{(express differently)}
\end{align*}
$$

From above, how many times must we divide $n$ by $a$ in order to reach $1$? Answer: $b$ times.

Recall that exponential and logarithmic functions are defined in the following manner:

> **Exponential:** The exponential function with base $a$ is defined for all real numbers $x$ by $f(x) = a^x$ where $a > 0$ and $a\neq 1$.
>
> **Logarithmic:** Let $a$ be a positive number with $a\neq 1$. The logarithmic function with base $a$, denoted by $\log_a$, is defined by $\log_a x = y\iff a^y = x$, where $\log_a x$ is the *exponent* to which the base $a$ must be raised to give $x$.

### What's so special about logarithms with base 2 in the context of computer science?

Mathematically, we know $\log_2(n) = a$ means $2^a = n$, but a more useful way of thinking about it is the following: "$\log_2(n)$ is the number of times we must halve $n$ to reach $1$." Why does this matter? Binary search!

### Does it matter if we use a base 2 logarithm or a base 10 logarithm when doing calculations?

It really doesn't matter. Recall the change of base formula for logarithms:

$$
\log_b x = \frac{\log_a x}{\log_a b}.
$$

Specifically, if we let $\log_b x = a$, then $x = b^a$ by the definition of logarithms, whereby $\log_a x = \log_a (b^a)$, which further simplifies to $\log_a x = a\log_a b$; hence, we have $\frac{\log_a x}{\log_a b} = a$. Since we let $\log_b x = a$ at the outset, we see we ultimately have $\frac{\log_a x}{\log_a b} = \log_b x$, as desired.

The upshot? We see that the difference between $\log_2 n$ and $\log_{10} n$ is a *constant*, which can be ignored in big O analysis:

$$
\log_2 n = \frac{\log n}{\log 2} = \frac{1}{\log 2}\cdot \log n\approx 0.301\cdot\log n.
$$

### Why do we need to be cautious when analyzing the space complexity of copies?

Because we can easily overestimate or underestimate the space complexity if we don't have a solid understanding of our coding language. For example, the following code in Python requires $O(n)$ space, not what looks like $O(n^2)$ space on the surface, where $n$ is the length of the string `s`:

```python
def repeated_str(s):
    strs = []
    for i in range(len(s)):
        strs.append(s)
```

What's going on here? We append `n` strings of length `n` to `strs`, so it looks like the space complexity should be $O(n^2)$. However, in Python, it is $O(n)$ because there's a difference between *copying* a variable and just *referencing* it. In Python, `strs.append(s)` just appends a reference of `s` (i.e., a pointer to the address of `s` in memory), which takes just $O(1)$ space.

Copies can happen when using the assignment operator (`=`), but they may not be apparent because there is no consistent syntax between languages. Here are some examples:

| Language | COPY of a string `s` | Making a REFERENCE of a string `s` |
| :-- | :-- | :-- |
| Python | `s2 = s[:]` | `s2 = s` |
| C/C++ | `s2 = s;` | `s2 = &s;` |
| Go | `s2 = s` | `s2 = s[:]` |
| JavaScript | `s2 = s.splice()` | `s2 = s` |

For every language, there is a way to copy and a way to reference a variable, and mixing them up can derail an interview:

- If you intend to make a reference but make a copy instead, your code will use more space than needed and your space analysis may be wrong.
- If you need a copy but make a reference, your algorithm may be incorrect because you are unintentionally modifying the same variable instead of separate copies.

### How much space is required to represent an integer in Python?

We often treat integers as consuming $O(1)$ space, where different languages have a max integer size (e.g., 32 or 64 bits). If you try to represent a larger integer, then you get *integer overflow*. Python works differently when it comes to representing integers. 

In Python, integers are unbounded by default (no overflow). More bits are internally allocated as necessary to represent any integer. That is **not** constant space. So, if we have a super big integer, $k$, how many bits do we need? One way to think about it is that, each time we add one bit to the representation, we can represent twice as many values. With 1 bit, we can represent 2 values. With 2 bits, we can represent 4 values, and so on. This is the *repeated doubling* pattern we saw with logarithms. The fact that the range doubles for each bit means that we need $O(\log k)$ bits to represent a value `k`.

Hence, *technically*, an integer `k` in Python takes $O(\log k)$ space. However, the default assumption is that we are not working with huge numbers and each integer takes $O(1)$ space. After all, 64 bits is enough to represent numbers in the billions of billions, which is enough for the vast majority of coding problems.

### Why is time complexity always equal to or bigger than extra space complexity?

There are plenty of algorithms that require $O(n^2)$ time and $O(n)$ space, but it wouldn't make sense for an algorithm to take $O(n)$ time and $O(n^2)$ extra space. The reason is simple: it takes $O(n^2)$ time to initialize $O(n^2)$ space. If an algorithm uses a lot of space, then it will also use just as much time.

### Why is being able to identify problems as NP-complete a valuable skill?

Because you may otherwise spend a great deal of time trying to find an efficient algorithm that doesn't exist. Specifically, NP-complete problems are those where the output *size* is not exponential but nothing faster than an exponential time algorithm is known to exist. NP-hard problems are at least as difficult as NP-complete but often harder (e.g., subset enumeration is exponential in both time and space).

In the context of interviews, the important thing is to be able to identify a problem as NP-complete and convey that to the interviewer to shed light on why it's not fruitful to try to pursue a solution faster than exponential time.

### What are some well-known NP-complete problems to be on the lookout for in interviews?

- TSP
- Longest path
- Hamiltonian path (visit each node once without having to revisit a node &#8212; note that the same problem but with "node" changed to "edge" becomes an Eulerian path-finding problem and is not NP-complete)
- Graph coloring
- Knapsack
- Subset sum

## Chapter 22 {#c22}

### Why is it a good idea to try to establish reasonable lower and upper runtime bounds for solving a problem before trying to start generating solutions?

Because otherwise you risk wasting your time on trying to generate solutions that may not even be possible. Additionally, establishing reasonable lower and upper bounds should result in a more manageable "shortlist" of sorts for possible solutions to consider.

### What are the two primary types of lower bounds and what characterizes each?

- **Output-size:** The output size itself is a lower bound for the runtime (time complexity must always be greater than or equal to space complexity). Sometimes this type of lower bound doesn't yield useful information (e.g., when the expected output is just a number or boolean). But for many problems, the expected output size is linear with respect to the input size, which means we can safely rule out sub-linear options. When the expected output size is expected to be more than linear, this is when this type of lower bound is most constraining.
- **Task-based:** Sometimes it is *obvious* that, no matter how we approach the problem, there's a "task" that needs to happen. And sometimes we can use that task to effectively establish a lower bound. For example, consider the classic problem of finding the maximum number from a given array of numbers. Even though the output size is just a single number (i.e., $O(1)$), it's clear the task we must perform is to at least examine/consider every single number in the given array, which requires a runtime of $O(n)$. This means we can safely discard sub-linear runtimes like $O(1)$ and $O(\log n)$ as possibilities when it comes to crafting a solution. The upshot? We can see that the problem of finding the maximum number in an array has an output-size lower bound of $O(1)$ and a task-based lower bound of $O(n)$.

  It's important to keep in mind that the main purpose of the task-based lower bound is to rule out sublinear solutions. Why? Because sometimes, for example, there may be a very clever application of binary search to a problem we hadn't thought of.

### If the output-size and task-based lower bounds are different, which one should be used?

Whichever one is larger! That is, if $A$ is the output-size lower bound and $B$ is the task-based lower bound, then $\max(A, B)$ should be what you choose as a frame of reference when thinking about possible solutions.

### What are the two primary types of upper bounds and what characterizes each?

- **Naive upper bound:** Think about the most obvious solution that comes to mind and solves the problem &#8212; congratulations, you've found the naive upper bound! Usually this will correspond with approaching something in a brute force manner where no optimizations are made. 
- **TLE upper bound:** How long can your attempted solution run before it times out for a certain online judge that runs your code?

### How can knowing the maximum expected input size and having a general understanding of TLE errors give you a competitive edge when designing algorithms?

Because knowing the maximum input size lets you plan for roughly how long different coding solutions might take given different complexities.

This is somewhat of a more refined tool for analysis than just thinking about the naive upper bound. Specifically, "TLE" stands for "Time Limit Exceeded" and is usually an error you might run into on a coding platform like LeetCode. Basically, whatever online judge is executing your code has timed out and has returned TLE as the error. What was the cause?

The exact cause will obviously depend on the specific online judge being used, but we can make some meaningful observations regardless based on a few reasonable assumptions:

- The online judge will run between $1$ second (pessimistic) and $3$ seconds (optimistic) for each test before timing out and returning a TLE error.
- The online judge runs on a processor between $1$ GHz (pessimistic) and $5$ GHz (optimistic), where GHz stands for [gigahertz](https://en.wikipedia.org/wiki/Hertz#Computers) and 1 GHz denotes 1 billion ($10^9$) CPU cycles per second.
- We submit different solutions to this online judge, where our solutions range in time complexity from $O(n!)$ (pessimistic) to $O(1)$ (optimistic).

So the really big question becomes the following: At what point (i.e., input size) will we run into a TLE error?

Remember that big O is all about how algorithms perform *at scale*, where the input size $n$ approaches infinity. In that context, constants don't matter, non-dominant additive terms can be dropped, etc. But now we're looking at things from a much more practical standpoint. Constants do matter to a degree. We want to see how big the input size can be for algorithms in different complexity classes before we might get a TLE error.

So far we have two simplifying assumptions: (1) The time permitted for running code by an online judge is a *constant* that's bounded between $1$ and $3$ seconds, and (2) the processor speed of $1$ to $5$ GHz is also a bounded constant. There may be *tons* of other constants. To adjust for some of these other constants that will be hidden by big O, let's further assume that if $f(n)$ represents the runtime complexity of our algorithm, then we can let $10\cdot f(n)$ and $1000\cdot f(n)$ represent just how much of a role these "extra constant forces" play in the efficiency of our algorithm, where $10\cdot f(n)$ is an optimistic estimate where the effect of constants is on the low end of estimates (i.e., our algorithm needs $10\cdot f(n)$ CPU cycles) and $1000\cdot f(n)$ is a pessimistic estimate where the effect of constants is somewhat on the high end of estimates (i.e., our algorithm needs $1000\cdot f(n)$ CPU cycles). A very high-level language like Python could be closer to the higher end of estimates while a language closer to the metal like C could be closer to the lower end of estimates.

How do we determine what the maximum input size can be for each complexity class on the optimistic side as well as the pessimistic side? Well, let's consider all of the variables we're dealing with for our calculation (note that these "variables" are really bounded constants, where we're trying to provide reasonable ranges for each):

- $C\cdot f(n)$ CPU cycles, where $f(n)$ represents the runtime complexity for an input of size $n$ and $C$ represents the "extra constant forces".
  + $10\leq C\leq 1000$; $C = 1000$ (pessimistic); $C = 10$ (optimistic)
- $S$, where $S$ denotes the number of seconds our algorithm is allowed to run before it times out
  + $1\leq S\leq 3$; $S = 1$ (pessimistic); $S = 3$ (optimistic)
- $G$, where $G$ denotes the number of gigahertz our processor is running (i.e., $G\cdot 10^9$ CPU cycles per second)
  + $1\leq G\leq 5$; $G = 1$ (pessimistic); $G = 5$ (optimistic)

We need to relate these variables to each other somehow to start testing $n$-values. How can we do that? Well, $C\cdot f(n)$ represents the number of CPU cycles our algorithm will need for some value of $n$ that will be plugged into $f(n)$; hence, we have $C\cdot f(n) = ?$, where $?$ itself must also denote CPU cycles. We can fill in the missing value for $?$ from what we're given for $S$ and $G$: $S\cdot G$. That is, the equation we ultimately need to resolve is the following:

$$
C\cdot f(n)\;\text{CPU cycles} = S\;\cancel{\text{seconds}}\cdot G\;\frac{\text{CPU cycles}}{\cancel{\text{seconds}}}
$$

We can rewrite the equation above as

$$
f(n) = \frac{S\cdot G}{C}.
$$

How can we find the $n$-value we seek? [Recall](https://en.wikipedia.org/wiki/Inverse_function#Inverses_and_composition) the following fact about composition of inverse functions from high school mathematics (pre-calculus): if the function $f$ has an inverse, we label it $f^{-1}$ and we observe the following facts: $f^{-1}(f(x)) = x$ and $f(f^{-1}(x)) = x$. How does this help here? Well, assuming $f(n)$ is invertible, we can take the inverse of both sides to get $n$:

$$
n = f^{-1}(SG/C).
$$

Remember what the value $n$ stands for in the equation above: it denotes the highest $n$-value our algorithm can take before it times out and returns a TLE error. Of course, when talking about input size, we always talk about an input size that is a non-negative integer (most often positive). Hence, if the $n$-value we obtain above is *not* an integer, then we need to consider the greatest integer less than or equal to that $n$-value (i.e., we need to take the [floor function](https://en.wikipedia.org/wiki/Floor_and_ceiling_functions) of $n$). Our final result, then, is the following:

$$
n = \lfloor f^{-1}(SG/C)\rfloor
$$

Recall the following values for $C$, $S$, and $G$:

| Variable | Optimistic | Pessimistic | Description |
| :-- | :-- | :-- | :-- |
| $C$ | $10$ | $1000$ | Factor of extraneous constants |
| $S$ | $3$ | $1$ | How many seconds our algorithm is allowed for execution time |
| $G$ | $5$ | $1$ | Speed of the processor running the code for our algorithm in gigahertz (GHz) |

Hence, our equation becomes the following for the optimistic case:

$$
n = \lfloor f^{-1}(SG/C)\rfloor = \lfloor f^{-1}(3\cdot 5\cdot 10^9 / 10)\rfloor = \lfloor f^{-1}(1.5\times 10^9)\rfloor
$$

And the following for the pessimistic case:

$$
n = \lfloor f^{-1}(SG/C)\rfloor = \lfloor f^{-1}(1\cdot 1\cdot 10^9 / 1000)\rfloor = \lfloor f^{-1}(1\times 10^6)\rfloor
$$

Before we start churning through actual computations, we clearly need to find out what $f^{-1}(n)$ is for some of the functions $f(n)$ when we're looking at what to expect for $O(f(n))$:

| Time complexity | $f(n)$ | $f^{-1}(n)$ |
| :-- | :-- | :-- |
| $O(n!)$ | $n!$ | None |
| $O(2^n)$ | $2^n$ | $\log_2(n)$ |
| $O(n^3)$ | $n^3$ | $n^{1/3}$ |
| $O(n^2)$ | $n^2$ | $n^{1/2}$ |
| $O(n\log n)$ | $n\log n$ | Complicated |
| $O(n)$ | $n$ | $n$ |
| $O(\log_2 n)$ | $\log_2 n$ | $2^n$ |
| $O(1)$ | $1$ | None |

With the above table in mind, let's explore what the maximum value of $n$ can be to avoid getting a TLE error in the optimistic and pessimistic cases. We have to answer the questions below, where $f(n)$ represents the time complexities under consideration: $n!$, $2^n$, $n^3$, $n^2$, $n\log n$, $n$, $\log_2 n$, and $1$. We use the inverse function $f^{-1}(n)$ to help answer the questions.

- **Pessimistic case:** What is the largest integer $n$ for which $f(n) \leq 1.5\times 10^9$?
- **Optimistic case:** What is the largest integer $n$ for which $f(n) \leq 1\times 10^6$?

| Time complexity | Max n (pessimistic) | Max n (optimistic) |
| :-- | :-- | :-- |
| $O(n!)$ | 9 | 12 |
| $O(2^n)$ | 19 | 30 |
| $O(n^3)$ | 100 | 1,144 |
| $O(n^2)$ | 1000 | 38,729 |
| $O(n\log n)$ | 62,746 | 58,154,442 |
| $O(n)$ | 1,000,000 | 1,500,000,000 |
| $O(\log_2 n)$ | $2^{1\times 10^6}$ (insanely huge) | $\floor 2^{1.5\times 10^9}\rfloor$ (even huger) |
| $O(1)$ | No maximum | No maximum |

Why is the table above helpful for boundary thinking? Because coding problems generally specify input-size constraints. That is, you're generally told what kind of input size you should plan to accommodate (e.g., `1 <= n <= 1000`). Hence, without even looking at the coding question, we can examine the input-size constraints to infer two things:

- Time complexities that are definitely too high.
- Time complexities that the interviewer or online judge is likely looking for.

For example, if we're given a maximum input size of `500`, then we can safely rule out algorithmic solutions that have a factorial or exponential runtime. If, however, we're given a maximum input size of `20`, then, in most cases, that upper bound is tacit permission to use exponential-time algorithms (here we can rule out factorial-time solutions).

Think of it this way: in an online assessment, if the goal of the problem setter was to check if you can find the optimal solution, which happens to take $O(n)$ time, they would add test cases large enough to ensure $O(n^2)$-time and worse solutions would time out (assuming plausible constant factors).

What all of this means is that we can basically establish some helpful thresholds to guide our solution-crafting process. In the table below, let `n` be the input size.

| Constraint | Expectation |
| :-- | :-- |
| `n < 10` | The problem setter is likely looking for a factorial solution. |
| `n < 20` | The problem setter is likely looking for an exponential solution. |
| `n < 500` | The problem setter is likely looking for a cubic solution. Anything higher can be ruled out. |
| `n < 10000` | The problem setter is likely looking for a quadratic solution. Anything higher can be ruled out. |
| `n >= 10000` | If the input size can be bigger than `10,000`, we can rule out quadratic or worse solutions. |

The bounds above we can call TLE upper bounds. They're not hard rules but useful heuristics.

### How can you effectively use the upper and lower bounds you've established?

Let's say we've established the larger of the two lower bounds (output-size and task-based) and have also established the smaller of the two upper bounds (naive and TLE), how do we actually use those bounds effectively? Well, we're basically in one of two possible scenarios:

- **Upper and lower bounds are identical.** We can narrow our search to algorithms with that time complexity.
- **Upper bound is larger than the lower bound.** We must consider solutions that could be anywhere in the range.

## Chapter 23 {#c23}

### What was Sean Lee's primary advice for how to get a job at FAANG?

*Do as many problems as possible until you've developed an intuition for how to solve new problems well.* We can call this the *problem-grind mindset*.

There's really a ton of validity to this approach. I found this out for myself in a more narrowly confined environment when I did tons of SQL problems over a 2-week stretch. It's pretty tough at first. But you start to pick up on what's actually important very quickly (e.g., CTEs and window functions with SQL), and you really start to get an intuition as to what tools you should reach for and when.

The problem? It takes a ton of time and dedication. As Sean noted in [his talk](https://www.youtube.com/watch?v=YJZCUhxNCv8), getting good at coding interviews requires more practice than the average candidate tends to put in. But if you think about all of this as really your *profession*, then it becomes somewhat of an easier pill to swallow.

Motivating words: an interviewer can limit you to 45 minutes of problem-solving in an interviewer, but they can't limit how much you can prepare in advance.

### What exactly is a "trigger" in the context of solving coding problems in interviews?

*A trigger is a hint embedded in the problem description itself.* The problem-grind mindset described above relies on the *quantity* of problems being solved to help build intuition for what to do for any given problem. But, of course, this intuition itself is built over time by gradually learning what pieces of information given in a problem actually tell you in terms of what kinds of techniques you should reach for in order to solve a problem. Those "pieces of information" can be called "triggers" when thought of in a certain way.

Trigger thinking is essentially a shortcut to optimal answers in coding interviews. If you see a particular trigger in a problem, then it indicates that a specific technique, data structure, or algorithm *could be* useful (not that it necessarily is or will be).

### Where should I look for triggers?

Everywhere: the problem description, the input/output types, the constraints, the examples, your naive solution, etc.

### What are some examples of trigger thinking in action?

| Trigger | Should cause us to consider trying ... |
| :-- | :-- |
| The *input* is a *tree*. | Try DFS or BFS. |
| The *output* is a *subarray*. | Try a sliding window. |
| The problem has a *constraint* requiring us to find an *in-place* solution. | Try the two-pointer technique. |
| The problem *description* mentions *dependencies*. | Try topological sort. |
| The *description* contains a *self-referential* definition. | Try recursion. |
| The *input examples* are *sorted*. You ask a clarifying question to see if this is always the case, and the interviewer confirms. | Try binary search. |
| The *bottleneck* in your approach is *sorting*. | Try heaps or specialized sorts. |
| The problem has a *trigger* for *greedy algorithms*, but the greedy approach doesn't work. | Try closely related techniques such as backtracking and dynamic programming. |

### What triggers should be thought of given certain keywords and why?

| Trigger | Keywords | Description |
| :-- | :-- | :-- |
| Two pointers | palindrome, reverse, swap, merge, partition | The input consists of one or two arrays/strings/linked lists. We need to use $O(1)$ extra memory or modify the input in place. The input is sorted. The naive solution is $O(n^2)$, and we want to get to $O(n)$. |
| Binary search | sorted, threshold, range, boundary, find, search, minimum/maximum, first/last, smallest/largest | The input is a sorted array/string. The brute force involves repeated linear scans. We are given an optimization problem that's hard to optimize directly. |
| Sets and maps | frequency, unique, duplicate, grouping, union, intersection, anagram, caching | There is some "key-like" concept in the problem. We are doing multiple linear scans in arrays. The input and/or output order is irrelevant in our algorithm. Linear-time target complexity. The problem is a sliding window problem. |
| Stacks and queues | Right-to-left combinations/transformations; undo/redo actions; balanced parentheses. Brackets like `[]`, `()`, `{}`, and `<>`, quotation marks, code comment markers like `/* /`, and even the double asterisks (`**`) used to bold text in Markdown. Next Greatest Element. | nested, bracket, parentheses |
| Recursion | The input data is a recursive data structure or has a recursive or "nesting" nature (e.g., a binary tree or an array where each element can itself be an array). The problem statement includes a self-referential definition (e.g., Fibonacci). You find yourself wanting to write a number of nested loops that depend on the input. The problem is related to merge sort or quicksort. | nested, quicksort, merge sort |
| Linked lists | The input is a linked list. We need $O(1)$ access to both the beginning and the end of a data structure while maintaining insertion order. Data structure design questions. |  |
| Graphs | The input is an edge list or a grid. The topic is related to connectivity, reachability, or distance. Problems involving pairwise relationships between input elements. Geometric problems. | path, source, destination, goal, steps, travel, maze, points |
| Heaps | The data is dynamic, like in "data structure design" questions where the answer changes over time; top-$k$ type problems; the naive solution uses sorting; the goal is to optimize the extra space. | top/bottom, minimum/maximum, largest/smallest, median |
| Sliding windows | The input type is just an array of numbers or a string, and maybe a number. The lower bound is linear. | subarray, substring, length, contiguous, consecutive, range, longest, or shortest |
| Backtracking | Problems with maximum input sizes in the lower 2-digits; enumeration problems or problems with exponential-sized outputs in general; NP-complete problems, especially optimization ones; games and puzzles (like N-queens, sudoku, knight's tour problem); subset-based or permutation-based problems; problems where you'd think of using DP but there are no overlapping subproblems. |  |
| Dynamic programming | It's an optimization or counting problem, and the naive solution is backtracking. You have to make a sequence of choices. Path-finding problems where you can't go back. |  |
| Greedy | optimization problems; interval problems; problems where you'd use backtracking but you need better-than-exponential runtime. |  |
| Topological sort | The input is a DAG, or at least a directed graph; there is some notion of dependencies or prerequisites (even if the input is not a graph); the question is about distances or paths; the runtime upperbound is linear. |  |
| Prefix sums | The input consists of an array/strings. We need to use $O(1)$ extra memory or modify the input in place. Problems with multiple subarrays, especially when sliding windows don't seem to work. The input is sorted. The naive solution is $O(n^2)$, and we want to get to $O(n)$. Problems with ranges or intervals. | prefix, suffix, partition, subarray |

### How can trigger thinking be combined with boundary thinking?

TLDR:

1. Start with boundary thinking to establish upper and lower bounds.
2. Then, identify triggers and consider the relevant techniques that fit within our established boundaries. 

### What are some notable points from Sean Lee's "How to Get a Job at the Big 4" talk?

[Here's the talk](https://www.youtube.com/watch?v=YJZCUhxNCv8). Some noteworthy points:

- **Why the big 4?** Brand equity. Anyone who works at a big tech company has to go through a rigorous interview process. If they have a name on their resume from big tech ... it's like getting a stamp that says, "I'm *at least* this good." But which of the big 4 should you go to? The truth is that it doesn't really matter much. The most important thing to think about is not the little job perks that have made headlines in the news &#8212; it's what you're going to be doing for 8 hours a day, it's your team, it's your project, it's your manager, etc. Once you've worked at one of the big 4, it's way easier to get an interview everywhere else. Don't obsess over the specific company. You're not going to stay there for the rest of your life. Also, it's worth keeping in mind that it's a lot easier to *start* at a big 4 company and move somewhere else than the other way around.
- **Why does your specific language not matter as much at a big 4?** Whatever language you might be really good at, there's a good chance a big 4 company will have a place for you. If not, they will likely make a place for you. Big tech companies don't test for language expertise, which can be taught fairly quickly. They're testing for what can't be taught very quickly, namely CS fundamental concepts. The way you think as a programmer is much more important. Your reasoning skills, logic, and communication skills are what they want to pay big money for. That can't be taught overnight.
- **How do you get a job at the big 4?** Idiot's guide! It's simple: step 1 &#8212; get an interview ... somehow. Step 2 &#8212; do well on the interview. Jokes aside, this is actually the truth. It's *simple*, not *easy*.
- **Step 1 - get an interview ... somehow:** You've got to apply and have a resume when you do so. Your resume should be a single page, and each line and/or character should be thought of from the employer's perspective: why should we hire this person? It's not just talking about what you did, what your responsibilities were, but about the impact (quantitative) you had on your team and/or organization.

  It's really cool in the software engineering profession that usually the laptop you carry around is just as good as the one professional software engineers will use at work. So what's stopping us from working on personal projects or contributing to open-source projects? The answer is *nothing*, of course. What should your personal project be? Well, what do *you* want to do? Where do you see yourself going in your career?

  Hackathons are a great way to stimulate engineering growth in an artifically time-constrained setting. The pressure isn't all on you because you have a team. You'll learn a lot and you'll meet a bunch of people. So participate in as many hackathons as you can.

- **John Carmack tweet on perfection (from something someone else said):** "The ceramics teacher announced on opening day that he was dividing the class into two groups. All those on the left side of the studio, he said, would be graded solely on the quantity of work they produced, all those on the right solely on its quality. His procedure was simple: on the final day of class he would bring in his bathroom scales and weigh the work of the "quantity" group: fifty pounds of pots rated an "A", forty pounds a "B", and so on. Those being graded on "quality", however, needed to produce only one pot &#8212; albeit a perfect one &#8212; to get an "A". Well, came grading time and a curious fact emerged: the works of highest quality were all produced by the group being graded for quantity. It seems that while the "quantity" group was busily churning out piles of work &#8212; and learning from their mistakes &#8212; the "quality" group had sat theorizing about perfection, and in the end had little more to show for their efforts than grandiose theories and a pile of dead clay."
- **Personal project satisfaction:** It'll take a lot of work until your personal projects reach a level of quality that you're happy with. You may never be happy with it. And that's okay. You may go through several projects before you finally produce something you're proud of that you can add to your portfolio.

  Ever heard of Jennifer Dewalt? She comes from a non-coding background and [made 180 websites in 180 days](https://jenniferdewalt.com/) (half a year). Surely you can make something in a month? Challenge: make something and break some pots along the way.
- **Recap of getting an interview ... somehow:**
  + Apply with resume
  + Programming challenges
  + Referrals
- **Step 2 - do well on the interview:** The last thing you should be doing is just sitting at home coding by yourself. Critically, you need to do mock interviews. That's the highest-yield way to grow. When interviewing, the best answer is not always the "most optimal" one in terms of runtime complexity. The best answer is what the interviewer *expects*. It's a sort of confirmation bias you have to feed into. The whole thing is a game.

  What separates the people who do really well from those who don't? The ones who do really well do practice problems and mock interviews *regularly*. You have to break some pots. The ones who do really well also work regularly on improving their knowledge map. Again, you have to break some pots.

- **They can't limit how much you prepare beforehand:** Interviews are necessarily time-constrained. You have a certain amount of time to convey the best signal you can to try to get to a "hire" result. You'll often be constrained to 45-min time blocks. But before the interview? No time constraints! They can't limit how much time you use to prepare beforehand.

  For professional athletes, if they have a big game next week, do they think they need to start training now to prepare? No, training *is* part of their job! You have to train regularly for software engineering. That's part of your job.

- **Storytime:** It's easy to get discouraged when you don't get anything in the form of job offers or promising leads. You can't let the discouragement defeat you. Your work now prepares you not for a specific event &#8212; it isn't for a specific interview. This is part of your life now. If you get nothing this year, then you're just preparing for next year.
- **Sacrifices:** Sometimes it feels like programming and coding stuff is not a real job. It is. It's your livelihood. Sometimes you need to make sacrifices to position yourself as well as possible.

  Sean failed his intro DSA course. He also failed a subsequent CS course on software engineering. His GPA was 2.3. It took him 6 years to get a 4-year degree. Sean skipped classes for 2 weeks in order to do mock interview prep rigorously. No one wanted to do that much interview prep. Sean said, "Mike, you're going to be the Monday and Wednesday guy. Sam, you'll be the Tuesday and the Thursday guy. And Chris, you be the Friday guy." It took at least 5 rejections with the big 4 before getting a job (internship) with one of them &#8212; and that's not counting the times he applied and didn't hear back. That's the number of times he went in, interviewed, and was told he wasn't good enough.

  The great thing about resumes is that you don't have to put down how many times you failed at something. As Steve Jobs noted in a commencement speech at Stanford, "Stay hungry, stay foolish." Be foolish enough to think that you can get a job at one of the best companies in the world with only a 2.3 GPA. Doesn't matter if you've never had a job before, come from a coding background, etc. Stay hungry and stay foolish.
- **Skill only improves your luck:** It's worth noting that luck plays a very large part in the interview process. Your interview can get tanked for any number of reasons. But you can't let that dissuade you from honing your skills &#8212; refined skill only improves your luck. The easiest way to improve your luck is to keep applying, keep practicing, and keep interviewing.


## Chapter 24 {#c24}

### What is the "problem-solving booster" framework?

**ELDER** is a decent acronym to remember this framework:

- Exhaustive
- Levers
- Difficulty
- Enumerate
- Roadblock

In more detail:

- Exhaustive (brute force optimization)
  + Preprocessing pattern
  + Data structure pattern
  + Skip unnecessary work
- Levers (hunt for properties)
  + DIY
  + Case analysis
  + Reverse engineer the output pattern
  + Sketch a diagram
  + Reframe the problem
- Difficulty (decrease the difficulty)
  + Tackle an easier version
  + Break down the problem
- Enumerate (cycle through the catalog)
  + Think: could `_____` be useful?
- Roadblock (articulate your blocker)
  + Don't say "hint"
  + Show your work

## Chapter 25 {#c25}





## Chapter 26 {#c26}



## Chapter 27 {#c27}



## Chapter 28 {#c28}



## Chapter 29 {#c29}



## Chapter 30 {#c30}



## Chapter 31 {#c31}



## Chapter 32 {#c32}



## Chapter 33 {#c33}



## Chapter 34 {#c34}



## Chapter 35 {#c35}



## Chapter 36 {#c36}



## Chapter 37 {#c37}



## Chapter 38 {#c38}



## Chapter 39 {#c39}



## Chapter 40 {#c40}



## Chapter 41 {#c41}



## Chapter 42 {#c42}



## Chapter 43 {#c43}


## Linked readings (with notes)

### In Head-Hunting, Big Data May Not Be Such a Big Deal [C1]

- **Article:** [In Head-Hunting, Big Data May Not Be Such a Big Deal](https://www.nytimes.com/2013/06/20/business/in-head-hunting-big-data-may-not-be-such-a-big-deal.html) ([free version](https://archive.ph/cArKM))

The article makes it clear what Google values and tests for when hiring candidates:

> We want people who like figuring out stuff where there is no obvious answer.

People need to not only be comfortable with ambiguity but also *like it*. Additionally, the article makes clear why questions with a more behavioral slant are important, such as a difficulty you encountered on the job and what you did about it: they provide "meta" data on what the candidate considers difficult (or some other category) and how the candidate actually behaves.

Of course, technical skills are vitally important, but that's more of a baseline. Equally, if not more important, are the soft skills you exercise and the kind of positive signal you convey throughout the interview.

### This resume got me an interview! (Reddit) [C6]

- **Article:** [This resume got me an interview! (Reddit)](https://www.reddit.com/r/recruitinghell/comments/qhg5jo/this_resume_got_me_an_interview/)

The Reddit thread above shows just how much of a joke resumes can be and how recruiters often only scan for big name companies and/or schools.




## Linked readings (not yet read)

- Chapter 2
  + [What do the best interviewers have in common? We looked at thousands of real interviews to find out.](https://interviewing.io/blog/best-technical-interviews-common)
  + [Ultimate Guide to FAANG Interviews for Senior Engineers](https://interviewing.io/guides/hiring-process)
- Chapter 3
  + [If you're an engineer who wants to start a recruiting business, read this first.](https://blog.alinelerner.com/if-youre-an-engineer-who-wants-to-start-a-recruiting-business-read-this-first/)
- Chapter 4
  + [We analyzed thousands of technical interviews on everything from language to code style. Here's what we found.](https://interviewing.io/blog/we-analyzed-thousands-of-technical-interviews-on-everything-from-language-to-code-style-here-s-what-we-found)
- Chapter 5
  + [We built voice modulation to mask gender in technical interviews. Here's what happened.](https://interviewing.io/blog/voice-modulation-gender-technical-interviews)
  + [How do I know if I'm ready to interview at FAANG?](https://interviewing.io/blog/how-know-ready-interview-faang)
  + [Engineers can't gauge their own interview performance. And that makes them harder to hire.](https://interviewing.io/blog/people-cant-gauge-their-own-interview-performance-and-that-makes-them-harder-to-hire)
- Chapter 6
  + [Are recruiters better than a coin flip at judging resumes? Here's the data.](https://interviewing.io/blog/are-recruiters-better-than-a-coin-flip-at-judging-resumes)
  + [Resumes suck. Here's the data.](https://blog.alinelerner.com/resumes-suck-heres-the-data/)
  + [Lessons from a year's worth of hiring data](https://blog.alinelerner.com/lessons-from-a-years-worth-of-hiring-data/)
  + [Aline's LinkedIn](https://www.linkedin.com/in/alinelerner/details/experience/)
- Chapter 7
  + [Outbound candidates are 5x more likely to be hired than inbound candidates](https://www.gem.com/blog/outbound-candidates-more-likely-to-be-hired)
- Chapter 8
  + [Interview Resources by Company](https://interviewing.io/topics#companies)
- Chapter 9
  + [Maker's Schedule, Manager's Schedule](https://www.paulgraham.com/makersschedule.html)
- Chapter 10
  + [The Holloway Guide to Equity Compensation](https://www.holloway.com/bookshelf)
  + [An Engineer's Guide to Stock Options](https://blog.alexmaccaw.com/an-engineers-guide-to-stock-options/)
  + [What stage startup offers the best risk-reward tradeoff?](https://www.joinprospect.com/blog/which-stage-startup)
  + [top 10 myths of silicon valley](https://elainewherry.com/2014/08/07/top-10-myths-of-silicon-valley/)
  + [liquidation preferences](https://www.linkedin.com/posts/lpolovets_i-wrote-a-post-about-liquidation-preferences-activity-7171583604102275073-o9Qq/) (LinkedIn post about a Hacker News post by the same author)
  + [Meta confirms it's rescinded some full-time job offers](https://www.theverge.com/2023/1/11/23550302/meta-layoffs-hiring-freeze-tech-recession-labor)
  + [Flexport founder publicly slams his handpicked successor for hiring spree, rescinds offers](https://www.cnbc.com/2023/09/08/flexport-ceo-ryan-petersen-rescinds-hiring-offers-cuts-office-space.html)
- Chapter 11
  + [Research: Negotiating Is Unlikely to Jeopardize Your Job Offer](https://hbr.org/2024/05/research-negotiating-is-unlikely-to-jeopardize-your-job-offer)
- Chapter 12
  + [Learn How to Negotiate Your Salary with Expert Help](https://levelup.gitconnected.com/learn-how-to-negotiate-your-salary-with-expert-help-5afedd11a178)
- Chapter 13
  + [Exploding Offer Season](https://www.joelonsoftware.com/2008/11/26/exploding-offer-season/)
- Chapter 14
  + [The unwritten rules (till now) of negotiating with Meta](https://interviewing.io/blog/how-to-negotiate-with-meta)
- Chapter 15
  + [Google's interview types in detail](https://interviewing.io/guides/hiring-process/google#google-s-interview-types-in-detail)
  + [A Senior Engineer's Guide to the Amazon Leadership Principles Interview](https://interviewing.io/guides/amazon-leadership-principles)

## Linked videos (with notes)

- Chapter 4
  + [Interview Replay: Not getting a working solution, despite describing it successfully](https://start.interviewing.io/beyond-ctci/part-ii-ugly-truths/what-interviewers-wont-tell-you#replay-1): This video shows how a candidate failed to pass even though she apparently identified the correct approach right out of the gate. But she failed to code a bug-free version in passable time.

## Linked videos (not yet watched)

- Chapter 3
  + [Real Talk with Recruiting Leaders](https://www.youtube.com/watch?v=dHSufqvgUqY): Video on how recruiting leaders think about looking at resumes, debriefing interviews, and extending offers.
- Chapter 16
  + [Interview Replay: Mentorship session on how to discuss past projects](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-1)
  + [Interview Replay: Turning a difficult situation into a good story](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-2)
  + [Interview Replay: A non-technical story](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-3)
  + [Interview Replay: Tradeoff between standards and delivery](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-4)
  + [Interview Replay: Targeting a senior engineering role](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-5)
  + [Interview Replay: Targeting E5 at Meta](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-6)
  + [Interview Replay: Targeting a senior management role](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-7)
  + [Interview Replay: Another example of targeting E6 at Meta](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/content-what-to-say#replay-8)
- Chapter 17
  + [Interview Replay: Most complex project](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-1)
  + [Interview Replay: A failed project](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-2)
  + [Interview Replay: Dissatisfaction with the status quo](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-3)
  + [Interview Replay: Most difficult aspect of a project](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-4)
  + [Interview Replay: Refusing to compromise standards](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-5)
  + [Interview Replay: Unpopular decision](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-6)
  + [Interview Replay: Current role and project](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-7)
  + [Interview Replay: Disagreeing with your team](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-8)
  + [Interview Replay: Novel approach to a problem](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-9)
  + [Interview Replay: Two teams in conflict](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-10)
  + [Interview Replay: Opportunity to do something better](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-11)
  + [Interview Replay: Wrong ratio of technical details to people details](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-12)
  + [Interview Replay: A recent project](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-13)
  + [Interview Replay: Dealing with failure](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-14)
  + [Interview Replay: Seeing a bigger opportunity than planned](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-15)
  + [Interview Replay: No metrics](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-16)
  + [Interview Replay: Disagreement with manager](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-17)
  + [Interview Replay (Bonus): Storytelling mentorship session](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-1)
  + [Interview Replay (Bonus): Google-style behavioral interview](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-2)
  + [Interview Replay (Bonus): Amazon-style behavioral interview](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-3)
  + [Interview Replay (Bonus): Google-style behavioral interview](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-4)
  + [Interview Replay (Bonus): Staff-level behavioral interview](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-5)
  + [Interview Replay (Bonus): Netflix-style behavioral interview](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-6)
  + [Interview Replay (Bonus): Google-style behavioral interview](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-7)
  + [Interview Replay (Bonus): Behavioral mentorship session](https://start.interviewing.io/beyond-ctci/part-v-behavioral-interviews/communication-how-to-say-it#replay-bonus-8)

## Templates (non-technical)

### Resumes

[Resume templates](http://bctci.co/resume-templates) from BCtCI

### Referrals template (requesting a referral)

```
Hi {Name},

I've recently started looking around for work. {Company} seems an 
exciting place to  be – {give one  specific reason why}.

[If you're not 100% sure whether you want to start interviewing there]

I'd love to know what the day-to-day at {Company} is like.

[Insert a few thoughtful questions, such as:]

- What kinds of things are you working on/most excited about?
- What's your team like?
- What are some differences between this team/company and {the team we worked on together 
  before}?
- Would you be up for talking through some of these over a quick call or coffee?

[If you already know that you want to interview there]

Do you think you'd be comfortable referring me in? I've attached my resume, 
and here's my  LinkedIn.

This is the stuff I'm working on now:

- {Insert a few concise bullets}

[Assuming that you worked with this person before]

And, because it's been a little while, this is the stuff we worked on together:

{Insert a few concise bullets}

Thanks, and lmk if you need anything else from me to make it easier to refer me in!
```

### Cold outreach template if your target has an online presence

```
Hi {First Name},

I've read your work on {some details about their writing}, and 
I {insert your thoughts on the work}.

{If you can make the connection between their work and yours, 
talk about something similar you've been working on.}

{If you cannot, ask them a specific, thoughtful question about your work. 
Don't worry about making it "the perfect question" like you might when you 
attend a talk and want to sound smart. Any earnest question will do. 
You don't have to use this as a chance to show off!}

{Finally, close with a sentence or two about you, if you have some 
social proof or impressive accomplishments you can share.}

Would you be up for a quick chat this week or next?

Best,

{Your name}

{Insert 1-2 useful links about you. If you have a personal site, 
that's great. If not, a LinkedIn will do.}
```

### Cold outreach template if your target only has a LinkedIn profile

```
Hi {First Name},

{List 2 things about you. They can be impressive accomplishments 
of yours or social proof.}

I'm really interested in the work you're doing at {Company Name}. 
{If you know what team they're on and are interested in that specific team 
or are familiar with that team's accomplishments, great! If not, just write 
a few earnest sentences about why the company is interesting to you.}

Would you be up for a quick chat this week or next?

Best,

{Your name}

{Insert 1-2 useful links about you. If you have a personal site, 
that's great. If not, a LinkedIn will do.}
```

### Planning company order (managing your job search) [Worksheet]

Use [this worksheet](https://bctci.co/job-search-worksheet-1) to plan in which order you will apply to companies.

### What to say when postponing an interview

```
Hey [name], I'm really excited about interviewing at [company name].
Unfortunately, if I'm honest, I  haven't had a chance to practice 
as much as I'd like. I know how hard and competitive these interviews 
are, and I want to put my best foot forward. I think I'll realistically 
need a couple of months to prepare. How about we schedule my interview 
for [date]?
```

### What to say when speeding up an interview process

```
[If you need to speed up an early-stage startup]

At the moment, I'm wrapping up final interviews at a few companies 
and expect to make a decision in the next 2 weeks. Would it be 
possible to expedite the process? I'm really excited about 
{Company name} and want to make sure I don't miss out on the chance 
to work with you all.

[If you need to speed up a late-stage startup or a large company]

At the moment, I'm wrapping up onsites at {If you have FAANG or competitors 
offers, list them here. Otherwise just say "a few companies"} and expect 
to make a decision in the next 2 weeks.

[If you're pre-phone screen] Would it be possible to schedule my technical 
phone screen as soon as possible or perhaps go straight to onsite? 
Alternatively, maybe we can schedule the phone screen and tentatively 
schedule the onsite in parallel and then cancel if the phone screen doesn't go well?

[If you're post-phone screen] Would it be possible to schedule my final 
interview rounds as soon as possible?

I'm really excited about {Company name} and want to make sure I don't 
miss out on the chance to work with you all.
```

### What to say when slowing down before the onsite

```
[At a startup]

I would really appreciate it if we could postpone the onsite by a few weeks. 
I would like a bit more time to prepare. As you can imagine, I'm taking this opportunity 
very seriously and want to do everything I can to maximize my chances. If doing so would 
hurt my chances of getting hired because you have limited headcount right now, please let 
me know, and I'll think it through carefully.

[At a large company (applying for a specific team)]

I would really appreciate it if we could postpone the onsite by a few weeks. I would 
like a bit more time to prepare. As you can imagine, I'm taking this opportunity very 
seriously and want to do everything I can to maximize my chances. If doing so would hurt 
my chances of ending up on {TEAM}, let me know, and I'll think it through carefully. If 
there's a chance that I can end up on a different team, please let me know (this would 
not be my preference, as I'm very excited about this team; just trying to think through 
my options).

[Large company (centralized/has team matching)]

I would really appreciate it if we could postpone the onsite by a few weeks. I would 
like a bit more time to prepare. As you can imagine, I'm taking this opportunity very 
seriously and want to do everything I can to maximize my chances.
```

### What to say when slowing down after the onsite

```
[At a startup]

I'm currently wrapping up interviews with a few other companies. As you can imagine, 
this is a decision I'm not taking lightly, and I'd like to have as much information 
as possible. I expect to collect offers by {DATE} and make a decision by {DATE}. I 
promise not to accept any offers without discussing them with you.

[At a large company (applying for a specific team)]

I'm currently wrapping up interviews with a few other companies. As you can imagine, 
this is a decision I'm not taking lightly, and I'd like to have as much information 
as possible. I expect to collect offers by {DATE} and make a decision by {DATE}. If 
doing so would hurt my chances of ending up on {TEAM}, let me know, and I'll think 
it through carefully. If there's a chance that I can end up on a different team, 
please let me know (this would not be my preference, as I'm very excited about this 
team; just trying to think through my options). Regardless, I promise not to accept 
any offers without discussing them with you.
```

### Equity calculator

IIO's [equity calculator](https://docs.google.com/spreadsheets/d/10BZa1zUCK0ETzu-Qehs9i2Ik76EwAKi1ArKcLWALSUs/edit?usp=drive_link) can help spur insights about equity.

### What to say when recruiters ask about compensation

```
[For questions about comp expectations]

At this point, I don't feel equipped to throw out a number because I'd like to find out more about 
the opportunity first—right now, I simply don't have the data to be able to say something concrete. 
If you end up making me an offer, I would be more than happy to iterate on it if needed and figure 
out something that works. I promise not to accept other offers until I have a chance to discuss 
them with you.

[For when a recruiter provides you a salary range and asks you to comment on it]

Thank you for sharing that with me. Right now I don't know enough about the opportunity to value 
it concretely, and I honestly haven't done my market research. If you end up making me an offer, I 
would be more than happy to iterate on it if needed and figure out something that works. I promise 
not to accept other offers until I have a chance to discuss them with you.
```

### What to say when recruiters ask about where else you're interviewing

```
I'm currently speaking with a few other companies. I'll let you know if I get to the point where I have 
an exploding offer, and I promise not to accept other offers until I have a chance to discuss them 
with you.
```

### What to say when recruiters ask about timeline

```
[For questions about timeline, in cases where you want to share it (i.e., when the company you're 
talking to is faster than some of the others)]

I'm actively interviewing right now, and I expect to wrap up interviews in the next {n} weeks and 
then make a decision {m} weeks from now. How does that sound?

[For questions about timeline, in cases where you don't (i.e., when the company you're talking to 
is among the slowest)]

I'm at various stages with a number of different companies, but based on what you told me, it 
sounds like there won't be any timing challenges. I promise to keep you posted if anything comes 
up.
```

### What to say when given an offer without a hard deadline

```
Thank you so much, and thank you for all your help with this process so far! This is really exciting! 
I'll need some time to process and talk to my {family, partner, spouse}. I will get back to you as 
soon as I can, and I may have some questions as well.
```

### What to say when given an exploding offer

```
Thank you so much, and thank you for all your help with this process so far! This is really exciting! I 
would very much appreciate having a bit more time. I'll need a bit of time to process and to talk to 
my {family, partner, spouse}. Know that I'm very excited about Company X. At the same time, 
choosing where I work is extremely important to me. Of course, I will not drag things out, and I will 
continue to keep you in the loop, but I hope you can understand my desire to make as informed of 
a decision as possible. How about I make a decision by…?
```

### What to say when recruiters ask about compensation

```
[For questions about comp expectations at the end of the process]

It sounds like there's an offer coming, and I'm really excited about it. I'm not sure exactly what 
number I'm looking for, but if you'd be able to share what an offer package might look like, then I 
will gladly iterate on it with you if needed and figure out something that works. I promise not to 
accept other offers until I have a chance to discuss them with you.

[For when a recruiter provides you a salary range and asks you to comment on it at the end of 
the process]

Thank you for sharing that with me. I haven't done enough research to say definitively what I'm 
expecting. If you end up making me a concrete offer, I would be more than happy to iterate on it if 
needed and figure out something that works. I promise not to accept other offers until I have a 
chance to discuss them with you.
```

### What to say when recruiters ask about where else you're interviewing

```
I'm wrapping things up with a few companies and in process with a few more. I promise to keep 
you in the loop, and I promise not to accept other offers until I have a chance to discuss them with 
you.
```

### How to negotiate with Meta

This isn't a template but a blog entry on [how to negotiate with Meta](https://interviewing.io/blog/how-to-negotiate-with-meta). They're more aggressive than most FAANG companies.

### The reverse used car salesman (what to say in a boom market)

```
{I have 5 offers, including ones from Company X and Company Y/I have several strong offers} and 
am wrapping up the process with {Company M and Company Z/a few more}, but I'm really excited 
about this opportunity and will drop my other stuff and sign immediately if you can do the 
following:

- Increase the base to X
- Increase equity to Y
- Add a $Z signing bonus

Thank you so much, and I look forward to hearing from you. Hopefully, we'll be working together 
soon!
```

### The ladder, first email (what to say in a down market)

```
Thank you so much for your offer and for all your help with this process so far. I'm excited about 
this opportunity, but I have several other strong offers in hand, from a mix of startups and larger 
companies. I know you can't match FAANG salaries in cash, and I'm not expecting it (there are 
plenty of great reasons to choose startups over FAANGs), but it'd be great to see a significant 
increase in both the cash and the equity component, as well as a meaningful signing bonus.

Can you please let me know what's possible? I'd appreciate it very much.
```

### The ladder, second email (what to say in a down market)

```
As I mentioned, I have offers from a mix of startups and large companies. Most base salaries are 
around $200k, and I have a few strong signing bonuses as well. Equity is in the $400k-$500k 
range.
```

### The ladder, third email (what to say in a down market)

```
Thank you so much for your offer and for all your help with this process so far. I'm excited about 
this opportunity, but I have several other strong offers in hand, from a mix of startups and larger 
companies, including Stripe and Google. I know that you likely can't match FAANG salaries in cash, 
and I'm not expecting it, but it'd be great to see a significant increase in both the base salary and 
the signing bonus.
```

### The ladder, fourth email (what to say in a down market)

```
Thank you so much for your offer and for all your help with this process so far. I'm excited about 
this opportunity, but I have several very strong offers in hand, including one from Google. It would 
be great to see a significant increase in both the cash and the equity component of the offer, as 
well as a meaningful signing bonus.

Can you please let me know what's possible? I'd appreciate it very much.
```

### The ladder, fifth email (what to say in a down market)

```
The main component of the offer I'd like to focus on is that Google has offered me more than 
double the equity of Stripe's current offer. Please let me know what you can do. Thank you again 
for your help!
```

### The ladder, sixth email (what to say in a down market)

```
Thank you so much for your offer and for all your help with this process so far. I'm excited about 
this opportunity, but I have several very strong offers in hand, including one from Stripe with a 
significantly higher TC. It would be great to see a significant increase in both the cash and the 
equity component of the offer, as well as a meaningful signing bonus. Can you please let me know 
what's possible? I'd appreciate it very much.
```

### The ladder, seventh email (what to say in a down market)

```
Of course, happy to share. Stripe has offered me a $225k base with a $30k signing bonus. The 
equity component of the offer is comparable. I also have an offer from Bloomberg LP that includes 
a $50k signing bonus. And I have offers from several startups that include a $20k signing bonus 
and over $500k in equity.
```

### The ladder, final email (what to say in a down market)

```
Thank you for that increase. I really appreciate it. At the moment, Google has offered me $480k in 
equity. That said, Stripe is my first choice, and I'm ready to sign immediately if we can increase 
either the equity component or the cash component.
```

### What to Say 10 - Closing Out

```
Thank you for all your help throughout this process. I've been thinking long and hard about what to 
do. It hasn't been an easy decision, but I'm very strongly leaning toward accepting an offer from 
{Company}. They've made me a very strong offer that looks like this: {Share details}

I promised you that I would discuss with you any offers before accepting them, so I'd like to keep 
my word.

Please let me know if you'd like to chat. And regardless of outcome, thank you again.
```

### Strategies for identifying good technical projects to discuss in a behavioral interview

Good technical projects for behavioral interviews often have the following desirable characteristics (fill in the table for whichever project you're thinking about including):

| Desirable project characteristic | Demonstration |
| :-- | :-- |
| **Recency and familiarity** |  |
| **Large contribution** |  |
| **Part of a team, if possible** |  |
| **Difficult, open-ended task** |  |
| **Successes *and* failures** |  |
| **Signal-sending stories** |  |
| **Appropriate scope for the level you're targeting** |  |
| **High visibility, if possible** |  |

### Strategies for generating stories about technical projects in behavioral interviews (category-based and signal-based behavioral matrices)

**Category-based**

Fill out a matrix like the following for each job, team, or section of your career (note that it's always good to have more than one option for each entry):

|  | TEAM 1 |
| :-- | :-- |
| **Accomplishments and challenges** |  |
| **Leadership, influence, and decision-making** |  |
| **Conflict and collaboration** |  |
| **Enjoyment and learning** |  |
| **Mistakes and failures** |  |

A made up example:

|  | TEAM 1 | TEAM 2 |
| :-- | :-- | :-- |
| **Accomplishments and challenges** | API re-design | Backwards compatibility |
| **Leadership, influence, and decision-making** | Best: API re-design<br/>Backup: Documentation initiative | Integration Issues with client |
| **Conflict and collaboration** | Security issue | Best: Backwards compatibility<br/>Backup: Mobile client |
| **Enjoyment and learning** | Analytics tools | Scalability |
| **Mistakes and failures** | Production outage | Security issue |

**Signal-based**

Fill out a matrix like the following for each job, team, or section of your career:

|  | TEAM 1 | TEAM 2 |
| :-- | :-- | :-- |
| **STRENGTHS** |  |  |
| `<actual-strength>` | `<demonstration-from-TEAM-1>` | `<demonstration-from-TEAM-2>` |
|  |  |  |
| **WEAKNESSES** |  |  |
| `<actual-weakness>` | `<demonstration-from-TEAM-1>` | `<demonstration-from-TEAM-2>` |
|  |  |  |
| **COMPANY VALUES** |  |  |
| `<company-value>` | `<demonstration-from-TEAM-1>` | `<demonstration-from-TEAM-2>` |
|  |  |  |

A made up example:

|  | TEAM 1 | TEAM 2 |
| :-- | :-- | :-- |
| **STRENGTHS** |  |  |
| **Persistence** | Mobile redesign | Integration issues with client |
| **Data-driven** | Analytics tools | Backwards compatibility |
| **Influence** | API Re-design | Security issue |
|  |  |  |
| **WEAKNESSES** |  |  |
| **Blunt** | Teammate feedback reaction | Load screen redesign |
| **Impulsive** | Production outage | Mobile client |
|  |  |  |
| **COMPANY VALUES** |  |  |
| **Customer-driven** | Mobile redesign | Backwards compatibility |
| **Mentorship** | Junior engineer/PIP | Integration issues with client |

### Project effectiveness for behavioral interviews (self-quiz)

Projects you choose should score at least 5 of 7 for the following questions:

- [+1 Point] Can you clearly articulate the impact that you made, preferably with numbers?
  + [+1 Point] Did the project have well-defined metrics?
    * [+1 Point] Did you come up with the metrics?
- [+1 Point] Did you make any meaningful architectural decisions as part of this project?
- [+1 Point] Did you advocate for putting in some kind of process or some changes that made future projects better?
  + [+1 Point] Were you able to actually implement said process?
- [+1 Point] Do you remember this project in enough detail, to the point where you'd be comfortable answering in depth if your interviewer asks about what you would have done if some constraints were different?

### Behavioral answer matrix

Projects and stories you've identified using the category-based and signal-based matrices should now be captured using the STAR method. Fill in the cells below for each project or story you've identified (just use keywords and bullets, not word-for-word accounts).

|  | PROJECT/STORY 1 | PROJECT/STORY 2 | ... |
| :-- | :-- | :-- | :-- |
| **Situation** |  |  |  |
| **Task** |  |  |  |
| **Action** |  |  |  |
| **Result** |  |  |  |
| **Signals** |  |  |  |
| **Learnings/Improvements** |  |  |  |

For *signals*, detail what the project or story demonstrates about you in terms of desirable signals you want to show. For *learnings/improvements*, take the proactive step in preparing for inevitable follow-up questions from interviewers about your projects and stories.

## Templates (technical)