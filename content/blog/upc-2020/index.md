---
date: '2025-07-15T20:07:15+07:00'
draft: false
title: 'UPC 2020 - Quadcopter Stability in Wind'
tags:
    - 'Physics'
    - 'Programming'
    - 'Python'
---

[University Physics Competition](https://uphysicsc.com/) (UPC) is an annual event that undergraduates can partake in to solve a physics problem and writing a formal paper within 48 hours. We were a team of three and this was our first time attempting UPC. We took on the Problem B challenge, Quadcopter Stability in Wind, because that seems the most plausible given our high-school level knowledge at that time.

## The paper

{{< pdf src="/blog/upc-2020/upc_2020_262B.pdf" >}}

## The doodles

RIP Jamboard.

{{< pdf src="/blog/upc-2020/upc_2020_jamboard.pdf" >}}

[Here's an ipynb notebook](/blog/upc-2020/upc_2020_notebook.ipynb) for the code. Mostly for plotting, but I think there are new texts since I updated this after submitting. 

## Retrospect

I think I was super proud of this because this was my first "paper". Even if the problem was simplified to the best of our abilities, some even violating the problem description, we were proud that we could work on a problem that is not some template solution, building a model of the problem, etc. We came straight out of high-school so we mostly solve problems for exams.

Now, onto the paper itself. Reading this back, I want to rephrase the last paragraph on Section 3.1 to emphasize on what's said in Section 3.2

> The force exerted in the X-axis by the quadcopter is equal to the maximum wind force it could
resist.

Also the fact that we said \( 1 \text{ rad} \) is the maximum is wrong because \( \arccos{(F_g/F_t)} \) with \( F_g = 14.715\text{ N} \) and \( F_t = 28\text{ N} \) is technically \( 1.017 \text{ rad} \).

The problem was also simplified to the best of our abilities, even if some simplification violates the problem description. But this was what enabled us to work on the problem. Maybe I can come back here if I were to have "where to start" questions.

Now back to introspections. We had tons of fun solving this even if it might not be something extravagant, but **it's still something**. I emphasized that because I have been too fixated on solving something new to further progress the scientific world that I forgot the joy of solving problems for the sake of it. I forgot that this is how I gained knowledge, **bits of curiosities**.

Getting bronze was the cherry on top. Even though it was 50% of the participants receiving it, I am content.

## Other UPCs

- [UPC 2021](/blog/upc-2021)
- [UPC 2022](/blog/upc-2022)
