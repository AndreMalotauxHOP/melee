export type TutorialStep =
  | 'thrust'
  | 'turn'
  | 'fire'
  | 'special'
  | 'survive'
  | 'done';

export interface TutorialState {
  active: boolean;
  step: TutorialStep;
  timer: number;
  didThrust: boolean;
  didTurn: boolean;
  didFire: boolean;
  didSpecial: boolean;
}

export function createTutorial(active: boolean): TutorialState {
  return {
    active,
    step: 'thrust',
    timer: 0,
    didThrust: false,
    didTurn: false,
    didFire: false,
    didSpecial: false,
  };
}

export function tutorialPrompt(t: TutorialState): string | null {
  if (!t.active || t.step === 'done') return null;
  switch (t.step) {
    case 'thrust':
      return 'Hold W to thrust. Whip near the planet for free speed.';
    case 'turn':
      return 'Steer with A / D. Heavies turn like couches.';
    case 'fire':
      return 'Press F to pew. Lead the fridge a little.';
    case 'special':
      return 'Press G for Nope Blink when a shot owns your lane.';
    case 'survive':
      return 'Finish the fridge. Stay off the planet. Wrap edges are real.';
    default:
      return null;
  }
}

export function advanceTutorial(
  t: TutorialState,
  input: { left: boolean; right: boolean; thrust: boolean; fire: boolean; special: boolean },
  dt: number,
): TutorialState {
  if (!t.active || t.step === 'done') return t;
  const next = { ...t, timer: t.timer + dt };
  if (input.thrust) next.didThrust = true;
  if (input.left || input.right) next.didTurn = true;
  if (input.fire) next.didFire = true;
  if (input.special) next.didSpecial = true;

  if (next.step === 'thrust' && next.didThrust && next.timer > 0.8) {
    next.step = 'turn';
    next.timer = 0;
  } else if (next.step === 'turn' && next.didTurn && next.timer > 0.7) {
    next.step = 'fire';
    next.timer = 0;
  } else if (next.step === 'fire' && next.didFire && next.timer > 0.6) {
    next.step = 'special';
    next.timer = 0;
  } else if (next.step === 'special' && next.didSpecial && next.timer > 0.5) {
    next.step = 'survive';
    next.timer = 0;
  } else if (next.step === 'survive' && next.timer > 8) {
    next.step = 'done';
  }
  return next;
}
