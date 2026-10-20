import type { Role } from '@enigma/shared';

export interface Riddle {
  text: string;
  /** The correct answer and the tempting wrong option. */
  answer: string;
  wrong: string;
  /** What the category specialist knows. It helps, but never gives the answer away. */
  hint: string;
  /** Shown to the whole team once the riddle is solved. */
  explanation: string;
}

/**
 * Riddle bank: 5 per category, each with a single defensible answer.
 * Every category belongs to the role that holds its hints.
 */
export const RIDDLES: Record<Role, Riddle[]> = {
  // Numbers
  analista: [
    {
      text: 'Complete the series: 2, 6, 12, 20, 30, ?',
      answer: '42',
      wrong: '40',
      hint: 'Look at how much the gap between one number and the next keeps growing.',
      explanation: 'The differences are 4, 6, 8, 10… so the next one is 12: 30 + 12 = 42.',
    },
    {
      text: 'Complete the series: 3, 5, 9, 17, 33, ?',
      answer: '65',
      wrong: '49',
      hint: 'Look at the differences between consecutive numbers: what pattern do they follow?',
      explanation: 'The differences are 2, 4, 8, 16: they double. The next one is 32: 33 + 32 = 65.',
    },
    {
      text: 'Three years ago, Anna was twice as old as her brother. Today, the sum of their ages is 21. How old is Anna today?',
      answer: '13',
      wrong: '14',
      hint: 'Three years ago, the sum of their ages was 15.',
      explanation: 'Three years ago they were 10 and 5 (they add up to 15, and 10 is twice 5). Today they are 13 and 8: they add up to 21.',
    },
    {
      text: 'If 5 machines make 5 parts in 5 minutes, how many minutes do 100 machines need to make 100 parts?',
      answer: '5 minutes',
      wrong: '100 minutes',
      hint: 'How long does ONE machine take to make ONE part?',
      explanation: 'Each machine makes one part in 5 minutes. With 100 machines, each makes its part at the same time: 5 minutes.',
    },
    {
      text: 'We write down every number from 1 to 100. How many times is the digit 7 written in total?',
      answer: '20 times',
      wrong: '19 times',
      hint: '77 counts twice.',
      explanation: 'As the units digit: 7, 17, …, 97 (10 times). As the tens digit: 70 to 79 (10 times). Total: 20.',
    },
  ],

  // Words
  criptografo: [
    {
      text: 'Complete the letter series: F, L, S, F, R, ?',
      answer: 'A',
      wrong: 'E',
      hint: 'The letters are not random: think about who is playing, in order.',
      explanation: 'They are the initials of the team: Francisco, Laurent, Sayarnil, Flora, Romain and Arthur. The missing one is A.',
    },
    {
      text: 'Complete the letter series: O, T, T, F, F, S, S, ?',
      answer: 'E',
      wrong: 'N',
      hint: 'Count out loud and look at the first letter of each number.',
      explanation: 'One, Two, Three, Four, Five, Six, Seven… the next one is Eight: E.',
    },
    {
      text: 'Complete the series: JANUARY, MARCH, MAY, JULY, ?',
      answer: 'SEPTEMBER',
      wrong: 'AUGUST',
      hint: 'Look at how many months sit between one month on the list and the next.',
      explanation: 'It skips one month each time: January, (February), March, (April), May, (June), July, (August), September.',
    },
    {
      text: 'Every letter of this word has been shifted one position forward in the alphabet: DPEF. What is the original word?',
      answer: 'CODE',
      wrong: 'CORE',
      hint: 'To decrypt, move each letter one position back: D becomes…',
      explanation: 'D→C, P→O, E→D, F→E: CODE.',
    },
    {
      text: 'Which of these words is typed using ONLY letters from the top row of the keyboard (Q W E R T Y U I O P)?',
      answer: 'PROPERTY',
      wrong: 'PROGRAM',
      hint: 'Look at your keyboard: the top row starts with Q, W, E, R, T, Y…',
      explanation: 'P-R-O-P-E-R-T-Y are all in the top row. PROGRAM has a G, an A and an M, which are on other rows.',
    },
  ],

  // Logic
  hacker: [
    {
      text: 'Anna says: "Ben is lying." Ben says: "Cara is lying." Cara says: "Anna and Ben are lying." Who is telling the truth?',
      answer: 'Ben',
      wrong: 'Cara',
      hint: 'Try assuming Cara tells the truth and see if something breaks.',
      explanation: 'If Cara told the truth, Ben would be lying, but then "Cara is lying" would be false. Only Ben is consistent: Anna and Cara are lying.',
    },
    {
      text: 'Three chests hold gold, silver and bronze (one in each). Chest 1: "The gold is here." Chest 2: "The gold is NOT here." Chest 3: "The bronze is NOT here." All the labels lie. What is in chest 1?',
      answer: 'Silver',
      wrong: 'Bronze',
      hint: 'If a label lies, the opposite of what it says is true.',
      explanation: 'The gold is in chest 2 (label 2 lies) and the bronze is in chest 3 (label 3 lies). That leaves the silver in chest 1.',
    },
    {
      text: 'Rule: "If the light is red, the door is closed." You see that the door is open. What do you know for sure?',
      answer: 'The light is not red',
      wrong: 'The light is green',
      hint: 'If the light were red, what state would the door be in?',
      explanation: 'If it were red, the door would be closed. Since it is open, the light cannot be red. But it could be some other color that is not green.',
    },
    {
      text: 'There are 3 switches outside a room and a single bulb inside. You can only enter once. How do you find out which switch controls the bulb?',
      answer: 'Turn on 1 for a good while, turn it off, turn on 2 and enter: lit = 2; off and warm = 1; off and cold = 3',
      wrong: 'Turn on 1 and 2 at the same time, enter and see which bulb is warmer',
      hint: 'Besides light, a lit bulb leaves another sign that lasts for a while.',
      explanation: 'A warm bulb shows it was recently on. So lit, off-and-warm and off-and-cold identify each switch.',
    },
    {
      text: 'Two guards watch two doors: one leads to the exit and the other to a trap. One always tells the truth and the other always lies, and you don\'t know which is which. You ask one of them: "Which door would the other guard say is the exit?" and he answers: "Door A." Which door do you take?',
      answer: 'Door B',
      wrong: 'Door A',
      hint: 'Think through both cases: if the honest one answers, what does he pass on? And if the liar answers?',
      explanation: 'He always points to the wrong door: if the honest one speaks, he reports the liar\'s lie; if the liar speaks, he lies about the honest one\'s truth. So the exit is the other door: B.',
    },
  ],

  // Space
  navegador: [
    {
      text: 'You are facing north. You turn 90° right, then 180°, then 90° left. Which way are you facing now?',
      answer: 'South',
      wrong: 'West',
      hint: 'Draw a compass and turn one step at a time.',
      explanation: 'North → (90° right) East → (180°) West → (90° left) South.',
    },
    {
      text: 'You walk 3 steps north, 4 steps east and 3 steps south. How many steps in a straight line are you from where you started?',
      answer: '4 steps',
      wrong: '5 steps',
      hint: 'The steps north and south cancel each other out.',
      explanation: '3 north and 3 south cancel out: only the 4-step move east remains.',
    },
    {
      text: 'In a mirror you see a clock showing exactly 3:00. What time does the clock really show?',
      answer: '9:00',
      wrong: '3:00',
      hint: 'In a mirror, left and right are swapped.',
      explanation: 'A mirror swaps left and right: the hand that appears at 3 actually points to 9.',
    },
    {
      text: 'A 3×3×3 cube made of small cubes is painted on the outside. How many small cubes have exactly 2 painted faces?',
      answer: '12 cubes',
      wrong: '8 cubes',
      hint: 'Think about the edges of the cube: how many are there, and how many middle cubes does each have?',
      explanation: 'The cube has 12 edges and each has 1 middle cube (with 2 painted faces). The 8 corner cubes have 3 painted faces.',
    },
    {
      text: 'You are standing at dawn, when the sun rises in the east. Which direction does your shadow fall?',
      answer: 'Toward the west',
      wrong: 'Toward the east',
      hint: 'A shadow always falls on the side opposite the sun.',
      explanation: 'The sun is in the east, so the shadow is cast to the opposite side: the west.',
    },
  ],

  // Mechanics
  ingeniero: [
    {
      text: 'Five gears in a row, each meshed with the next. If the first turns clockwise, which way does the fifth turn?',
      answer: 'Clockwise',
      wrong: 'Counterclockwise',
      hint: 'Two gears that touch always turn in opposite directions.',
      explanation: 'They alternate: 1 clockwise, 2 counterclockwise, 3 clockwise, 4 counterclockwise, 5 clockwise.',
    },
    {
      text: 'Three identical gears form a triangle: each one meshes with the other two. Can they turn?',
      answer: 'No, they jam',
      wrong: 'Yes, they all turn',
      hint: 'If gear 1 turns clockwise, gear 2 must turn counterclockwise. And gear 3, relative to 1 and 2?',
      explanation: 'With an odd number of gears in a loop, the last one would have to turn both ways at once: it locks up.',
    },
    {
      text: 'An ideal movable pulley (no friction, no weight of its own) holds a 100 kg load. One end of the rope is tied to the ceiling and you pull the other. What force do you need to hold it in the air?',
      answer: '50 kg of force',
      wrong: '100 kg of force',
      hint: 'The load is shared between the two rope segments that go up.',
      explanation: 'Two rope segments hold the load, so each one carries half: 50 kg.',
    },
    {
      text: 'A balance with equal arms is level. On the left there are 2 identical blocks 3 cm from the center. On the right there is 1 identical block. How far from the center is that block?',
      answer: '6 cm',
      wrong: '5 cm',
      hint: 'In balance, weight × distance must be equal on both sides.',
      explanation: 'On the left: 2 × 3 = 6. On the right: 1 × d = 6, so d = 6 cm.',
    },
    {
      text: 'A glass filled to the brim with water has an ice cube floating in it. When the ice melts completely, what happens to the water level?',
      answer: 'It stays the same',
      wrong: 'It rises',
      hint: 'Floating ice displaces an amount of water equal to its own weight.',
      explanation: 'Floating ice displaces exactly the water it weighs; when it melts it becomes that same amount of water. The level does not change.',
    },
  ],

  // Reasoning
  estratega: [
    {
      text: 'A lily pad doubles in size every day and covers the whole lake in 48 days. In how many days does it cover half the lake?',
      answer: '47 days',
      wrong: '24 days',
      hint: 'If it covers the whole lake on the last day, how much did it cover the day before?',
      explanation: 'If it doubles every day, the day before the end it covered exactly half: day 47.',
    },
    {
      text: 'There are 3 doors and a prize behind one. You pick one. The host, who knows where the prize is, opens another door with no prize and lets you switch. What should you do?',
      answer: 'Switch doors',
      wrong: 'It makes no difference',
      hint: 'At the start, what was your chance of being right? And of being wrong?',
      explanation: 'Your first pick is right 1 time in 3. If you were wrong (2 in 3), switching wins. Switching wins 2 times out of 3.',
    },
    {
      text: 'At a meeting there are 6 people and each one shakes hands with everyone else, once. How many handshakes are there?',
      answer: '15',
      wrong: '30',
      hint: 'Each person greets 5 others, but every handshake involves two people.',
      explanation: '6 × 5 = 30, but each handshake was counted twice. 30 ÷ 2 = 15.',
    },
    {
      text: 'You have 8 identical balls and one is slightly heavier. With a two-pan balance scale, what is the minimum number of weighings that guarantees you find it?',
      answer: '2 weighings',
      wrong: '3 weighings',
      hint: 'You don\'t need to weigh them all: split them into three groups.',
      explanation: 'Weigh 3 against 3. If one side is heavier, the culprit is in that group; if they balance, it is among the remaining 2. Either way, one more weighing is enough.',
    },
    {
      text: 'A train goes from A to B at 60 km/h and returns along the same route at 40 km/h. What is its average speed over the whole round trip?',
      answer: '48 km/h',
      wrong: '50 km/h',
      hint: 'The trip out and the trip back don\'t take the same time: try a concrete distance, like 120 km.',
      explanation: 'With 120 km: the trip out takes 2 h and the trip back 3 h. In total, 240 km in 5 h: 48 km/h.',
    },
  ],
};
