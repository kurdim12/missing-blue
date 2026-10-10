# Missing Blue: 7-minute pitch + 3-minute Q&A

Format (official): 7 minutes to present and demo, then 3 minutes of questions. Panel: domain judge, AI/technical judge, business judge. Six criteria: Impact on Jordan · Innovation & Creativity · Feasibility & Scalability · Technical Implementation · User Experience & Design · Presentation & Pitch.

Rule for the presenter: every number you say is on the screen at that moment, with its badge (REAL / SIMULATED / ASSUMED). Say the badge out loud when it is not REAL. "Honesty about what is mocked" is part of the Technical score.

---

## Script

| Time | Screen | Criterion | What you say (short) |
|---|---|---|---|
| 0:00–0:40 | Problem | Impact | "41% of the water Jordan pumps is non-revenue water (Petra, Aug 2026). Most leaks never reach the surface. Crews find them by walking pipes street by street. The government's AI leak project works from sensor data. A town without sensors gets nothing from it. That's who we built for." |
| 0:40–1:00 | Problem | Technical honesty | "One line: free NASA radar finds ground that stays wet in the dry season, we check it against the utility's own pipe map, and AI decides where the crew goes. Everything you'll see is real public data, except pressure readings, which are simulated, and we'll say so." |
| 1:00–1:40 | Overview: radar time-lapse | Innovation | "NISAR, NASA–ISRO, public since July 2026. Karak, 4 → 16 → 28 September. Wet, then still wet, with 0 mm of rain between passes. 7 spots." |
| 1:40–2:00 | Overview: pipes | Impact | "This is the real Karak network, 1,287 km. It lands on the built-up areas without any adjustment." |
| 2:00–2:40 | AI triage (live or recorded) | Innovation, Technical | "The AI checks each spot with tools: nearest pipe, land cover, leak simulation. It keeps 2 and rejects 5 farmland spots, and it explains every decision. W7 is 6 m from a ¾-inch galvanized iron line, give or take 50 m." |
| 2:40–3:10 | Twin | Technical | "Why not just pressure loggers? In our twin of the Mazar zone, a 1 L/s leak at W7 moves pressure at only one other junction. A main break moves 788 of 850. Loggers catch big breaks. The satellite catches the hidden ones. Demand in the twin is assumed." |
| 3:10–4:20 | HydroFingerprint (live, invite a judge to tap) | Innovation, Technical | "Second problem: the pipe map itself has 107 gaps. Which are real connections? We trained on 4,800 simulations of the real network. Press 'AI: place next logger'… each logger removes doubt, in bits. Gaps A–D go to near-certain, Gap E stays 'can't tell', and the AI says so. Against a plain least-squares algorithm: 46.9% vs 26.7% all-five right, and 45.4% vs 23.9% when the network doesn't match the model. Readings are simulated." |
| 4:20–5:00 | Work order + crew phone (Arabic) | UX | Hold up the phone. "The crew gets this in Arabic: pin, 50-metre search circle, the pipe to walk, a checklist, and two buttons: leak found, no leak." |
| 5:00–6:10 | Impact & business | Feasibility, business | "Data cost: zero, every 12 days, all of Jordan. No sensors needed to start. One hidden 1 L/s leak is 86 cubic metres a day, 31,500 a year. Here the crew checks 2 sites instead of 1,287 km. Who pays: the utility, per governorate; we start with a pilot partner. That's our plan, not a signed deal." |
| 6:10–6:50 | Sources & method | Technical honesty | "Every number has a source you can open. What's real, what's simulated, what's assumed, and our limits: these are candidates, not confirmed leaks." |
| 6:50–7:00 | Next step | Pitch | "Next: one pilot in Karak. A crew checks W7 and W3. Those results become the first labels the system learns from. Thank you." |

Stop at 7:00 even mid-sentence. Rehearse with the demo-mode timer at least 3 times.

---

## 3-minute Q&A: likely questions by judge

### Domain judge (relevance, impact, feasibility)
- **"Is W7 a real leak?"** "We don't know yet. It's a candidate: wet on two passes, no rain, 6 m from a pipe, ±50 m. A crew with an acoustic detector confirms it. That's the pilot."
- **"Couldn't it be irrigation or a garden?"** "Yes. That's why the AI rejects farmland far from pipes. A garden right next to a pipe can still pass; the crew checklist handles that."
- **"Is the pipe map current?"** "It's the utility's 2020/2022 drawing. Newer pipes are missing, and the map has gaps, which is exactly what HydroFingerprint addresses."
- **"Who is left out today?"** "Networks with no sensor data. We need only a free satellite pass and the pipe map the utility already has."

### AI / technical judge
- **"Why not just a threshold rule or a plain algorithm?"** "The radar step is a rule, and we say so. The AI is in two places: an agent that reasons over evidence with tools, and HydroFingerprint, a physics-guided Bayesian model. It beats the plain algorithm 46.9% vs 26.7%, holds up on a mismatched network (45.4% vs 23.9%), and when it says ≥ 90% it's right over 99% of the time."
- **"Why Bayesian and not a bigger neural net?"** "We tested an MLP. With 5 gaps the Bayesian model wins; at 9 gaps (512 states, 15 loggers) the MLP edges ahead, 19.8% vs Bayesian 17.8%, and both crush the plain algorithm at 3.9%. We use each where it's stronger."
- **"How do you stop the LLM inventing numbers?"** "Facts go in as JSON, the model copies numbers exactly, and every screen falls back to a recorded run."
- **"Radar accuracy?"** "20 m pixels, about ±50 m position. We never claim metre precision."

### Business judge
- **"Who pays?"** "The water utility, per governorate. A pilot through a utility or donor partner first. That's our plan; we have no customer yet."
- **"What does it cost to run?"** "The radar is free. Processing ran on a laptop. The AI calls cost a small number of tokens per triage; the screen shows the token count."
- **"Competition?"** "ASTERRA sells commercial satellite leak detection. We use free public radar and add pipe-map repair, in Arabic, for Jordanian utilities."
- **"How does it scale?"** "NISAR covers all of Jordan every 12 days. Cost grows with compute, not with sensors in the ground. The limit is pipe maps: where they're missing or gappy, HydroFingerprint helps fix them."

---

## Hand-in checklist (Submit page, before 1:00 PM)
- [ ] Repo public, opens logged-out, README explains how to run it
- [ ] Deck link set to "anyone with the link"
- [ ] Prototype link / demo laptop ready, Wi-Fi-off tested
- [ ] Team name + registration reference ready
- [ ] Rough version submitted early; final resubmitted before 1:00 PM
