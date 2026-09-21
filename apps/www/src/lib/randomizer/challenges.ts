export interface Challenge {
  id: string;
  title: string;
  detail: string;
}

/**
 * The bravery half of the roll: self-imposed rules that turn a random build
 * into a run. Nothing here changes what you are allowed to buy, so a roll stays
 * playable even when every rule is in effect.
 */
export const CHALLENGES: Challenge[] = [
  {
    id: "exact-order",
    title: "Buy in order",
    detail:
      "Purchase the build strictly top to bottom. No skipping ahead, even when you can afford the next tier.",
  },
  {
    id: "no-recall",
    title: "No base shopping after 15:00",
    detail:
      "Once the clock passes fifteen minutes, every purchase has to happen outside your own base.",
  },
  {
    id: "parry",
    title: "Always parry",
    detail:
      "Every melee swing thrown at you gets a parry attempt. Trading damage instead counts as a fail.",
  },
  {
    id: "no-zipline",
    title: "Grounded",
    detail: "The zipline is off limits for the first ten minutes. Walk.",
  },
  {
    id: "melee-opening",
    title: "Fists first",
    detail:
      "Until your first tier 2 item is bought, melee is your only way to damage an enemy player.",
  },
  {
    id: "ult-on-cooldown",
    title: "Never bank the ultimate",
    detail:
      "Your ultimate goes out the moment it comes up. Saving it for a better moment is a fail.",
  },
  {
    id: "no-retreat",
    title: "No retreat",
    detail:
      "Never leave a lane fight you started. You win it, or you walk back from the spawn.",
  },
  {
    id: "soul-cap",
    title: "Spend it all",
    detail:
      "Never hold more than 1,000 unspent souls once your first item is bought.",
  },
  {
    id: "one-lane",
    title: "Lane loyalty",
    detail:
      "Stay in the lane you rolled until the first guardian on it falls. No rotations, no jungle.",
  },
  {
    id: "no-cancel",
    title: "Commit",
    detail:
      "Every ability you start casting gets finished. Cancelling a cast is a fail.",
  },
  {
    id: "callout",
    title: "Call every roll",
    detail:
      "Type your hero, your lane and your first item in all chat before the barrier drops.",
  },
  {
    id: "no-heal",
    title: "Denied",
    detail:
      "No healing from the rejuvenator crates in your own base. Regen and lifesteal only.",
  },
];
