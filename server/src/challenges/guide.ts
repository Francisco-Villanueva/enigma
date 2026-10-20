import type { ChallengeGuide } from '@enigma/shared';

/**
 * Plain-language help for every challenge, keyed by challenge id (0 = the warm-up round).
 * It is public, static text: it never contains anything a role is not allowed to know.
 * Each role task answers three questions: what do I do, what can't I see, who do I talk to.
 */
export const GUIDES: Record<number, ChallengeGuide> = {
  // ------------------------------------------------------------ warm-up
  0: {
    howTo: [
      'Everyone sees ONE digit of a secret 6-digit code. Nobody can see the others.',
      'Say your digit out loud on the call. The only way to win is to talk.',
      'The Hacker knows the order the digits go in and types the full code.',
    ],
    flow: [
      { from: 'navegador', to: 'hacker', what: 'their digit' },
      { from: 'analista', to: 'hacker', what: 'their digit' },
      { from: 'criptografo', to: 'hacker', what: 'their digit' },
      { from: 'estratega', to: 'hacker', what: 'their digit' },
      { from: 'ingeniero', to: 'hacker', what: 'their digit' },
    ],
    tasks: {
      navegador: {
        does: 'Read your digit out loud and tell the Hacker.',
        cantSee: 'The other five digits and the order of the code.',
        talkTo: 'Everyone — say your digit, then let the Hacker confirm.',
      },
      analista: {
        does: 'Read your digit out loud and tell the Hacker.',
        cantSee: 'The other five digits and the order of the code.',
        talkTo: 'Everyone — say your digit, then let the Hacker confirm.',
      },
      criptografo: {
        does: 'Read your digit out loud and tell the Hacker.',
        cantSee: 'The other five digits and the order of the code.',
        talkTo: 'Everyone — say your digit, then let the Hacker confirm.',
      },
      estratega: {
        does: 'Read your digit out loud and tell the Hacker.',
        cantSee: 'The other five digits and the order of the code.',
        talkTo: 'Everyone — say your digit, then let the Hacker confirm.',
      },
      ingeniero: {
        does: 'Read your digit out loud and tell the Hacker.',
        cantSee: 'The other five digits and the order of the code.',
        talkTo: 'Everyone — say your digit, then let the Hacker confirm.',
      },
      hacker: {
        does: 'Collect every digit from your teammates and type the code in the order shown on your screen.',
        cantSee: 'Your teammates\' digits: they have to tell you.',
        talkTo: 'Everyone — ask each role, by name, for their digit.',
      },
    },
  },

  // ------------------------------------------------------ 1. Power Core
  1: {
    howTo: [
      'Four of the ten reactors are critical (broken). The Analyst finds them; they must stay at 0%.',
      'For each healthy reactor, in the Strategist\'s order, the Cryptographer works out the exact power. The Engineer sets it and locks it.',
      'The Hacker confirms every lock with a link code that the Engineer reads out. After the last one, the Hacker seals the core.',
    ],
    flow: [
      { from: 'analista', to: 'estratega', what: 'which reactors are critical' },
      { from: 'analista', to: 'criptografo', what: 'temperature of the reactor being calibrated' },
      { from: 'navegador', to: 'criptografo', what: 'connections of that reactor' },
      { from: 'criptografo', to: 'ingeniero', what: 'the power to set' },
      { from: 'estratega', to: 'ingeniero', what: 'which reactor is next' },
      { from: 'ingeniero', to: 'hacker', what: 'the link code' },
    ],
    tasks: {
      navegador: {
        does: 'Tell the team which reactors each reactor is connected to, whenever they ask.',
        cantSee: 'Which reactors are critical, and any temperatures.',
        talkTo: 'The Cryptographer — they need the connection count of each reactor.',
      },
      analista: {
        does: 'Apply the diagnostic rule to the readings to find the 4 critical reactors, and send readings to the Cryptographer.',
        cantSee: 'The connection map, the power formula and the calibration order.',
        talkTo: 'The Strategist (critical reactors) and the Cryptographer (temperatures).',
      },
      criptografo: {
        does: 'Work out each healthy reactor\'s power with the formula, using connections and temperature.',
        cantSee: 'Which reactors are critical, and the connection map.',
        talkTo: 'The Navigator and Analyst for data, then the Engineer to give the power.',
      },
      estratega: {
        does: 'Cross out the critical reactors in your sequence; what\'s left is the calibration order.',
        cantSee: 'Which reactors are critical — the Analyst has to tell you.',
        talkTo: 'The Analyst (to learn the critical ones) and the Engineer (to say who goes next).',
      },
      ingeniero: {
        does: 'Set each reactor with the slider and lock it, one at a time, when the team says so.',
        cantSee: 'Every number: powers, order and critical reactors all come from teammates.',
        talkTo: 'The Cryptographer (power), the Strategist (order) and the Hacker (read them the link code).',
      },
      hacker: {
        does: 'Type the link code the Engineer reads out to confirm each reactor. When all are aligned, seal the core.',
        cantSee: 'The reactors themselves and their values.',
        talkTo: 'The Engineer — ask for the link code after every lock.',
      },
    },
  },

  // ------------------------------------------------------- 2. Navigation
  2: {
    howTo: [
      'The Navigator flies the drone from A1 to F6, through two checkpoints in order. Mines send the drone back and cost time.',
      'The Analyst, Cryptographer and Hacker work out where the mines are. The Strategist plans the cheapest route.',
      'The Engineer charges the thrusters for every move. At each checkpoint the Hacker has to decrypt a shield.',
    ],
    flow: [
      { from: 'criptografo', to: 'analista', what: 'true clues about the mines' },
      { from: 'hacker', to: 'analista', what: 'radar results ("is this cell a mine?")' },
      { from: 'analista', to: 'navegador', what: 'confirmed mines (flags)' },
      { from: 'estratega', to: 'navegador', what: 'the route, move by move' },
      { from: 'estratega', to: 'ingeniero', what: 'how much charge the next cell needs' },
      { from: 'ingeniero', to: 'navegador', what: 'thrusters charged — go!' },
    ],
    tasks: {
      navegador: {
        does: 'Steer the drone with the arrow keys, following the route the team agrees on.',
        cantSee: 'Where the mines are and how much each cell costs. Only a radar count of nearby mines.',
        talkTo: 'The Strategist (route) and the Analyst (mine flags). Don\'t move until the Engineer has charged the thrusters.',
      },
      analista: {
        does: 'Combine row, column and quadrant mine counts with the clues to deduce the mines, then flag them for the Navigator.',
        cantSee: 'The terrain, the route and the clues (the Cryptographer has them).',
        talkTo: 'The Cryptographer (clues), the Hacker (radar checks) and the Navigator (flags).',
      },
      criptografo: {
        does: 'Read your true clues aloud so the Analyst can deduce the mines. You also know the gravity rules.',
        cantSee: 'The mine counts and the map.',
        talkTo: 'The Analyst — and warn the Navigator about gravity (no long straight lines).',
      },
      estratega: {
        does: 'Find the cheapest route through the checkpoints in order, and call out each move.',
        cantSee: 'Where the mines are.',
        talkTo: 'The Navigator (moves) and the Engineer (how much charge the next cell costs).',
      },
      ingeniero: {
        does: 'Charge the linear (up/down) or lateral (left/right) thruster with exactly what the next cell needs.',
        cantSee: 'The map, the terrain costs and the mines.',
        talkTo: 'The Strategist — ask how much charge to load before every move.',
      },
      hacker: {
        does: 'Decrypt the shield at each checkpoint, and use radar checks on suspicious cells (the first 5 are free).',
        cantSee: 'Mine counts, clues and the terrain.',
        talkTo: 'The Analyst — ask which cells to check, and report the results.',
      },
    },
  },

  // ------------------------------------------------------------ 3. Circuit
  3: {
    howTo: [
      'A 4×4 board holds 6 circuit pieces. The team has to place each piece in the right cell with the right rotation.',
      'The Analyst sees which cells are used (for only 8 seconds!), the Cryptographer and Strategist work out which piece goes where.',
      'The Engineer places the pieces, the Navigator says how to rotate them, and the Hacker verifies the voltage.',
    ],
    flow: [
      { from: 'analista', to: 'criptografo', what: 'the 6 occupied cells (read them fast!)' },
      { from: 'estratega', to: 'criptografo', what: 'which pieces are in the top / bottom half' },
      { from: 'criptografo', to: 'ingeniero', what: 'which piece goes in which cell' },
      { from: 'navegador', to: 'ingeniero', what: 'which way each piece must point' },
      { from: 'estratega', to: 'ingeniero', what: 'the assembly order (phases)' },
      { from: 'hacker', to: 'analista', what: 'a re-scan, if they forgot a cell' },
    ],
    tasks: {
      navegador: {
        does: 'Tell the Engineer which direction each piece must point (the compass). You also highlight the cell in focus.',
        cantSee: 'Which piece goes in which cell, and the assembly order.',
        talkTo: 'The Engineer — give the rotation of each piece as they place it.',
      },
      analista: {
        does: 'Scan the board for 8 seconds and read the 6 occupied cells out loud before the screen goes blank.',
        cantSee: 'Which piece is in which cell. You only see dots.',
        talkTo: 'The whole team, especially the Cryptographer. Ask the Hacker for a re-scan if you need one.',
      },
      criptografo: {
        does: 'Use the identity clues with the Analyst\'s cells and the Strategist\'s halves to deduce which piece goes in each cell.',
        cantSee: 'The occupied cells and the rotations.',
        talkTo: 'The Analyst and Strategist for data, then the Engineer with the final answer.',
      },
      estratega: {
        does: 'Dictate the assembly order by phase and say which pieces go in the top and bottom half.',
        cantSee: 'The occupied cells and rotations.',
        talkTo: 'The Engineer (phase order) and the Cryptographer (halves).',
      },
      ingeniero: {
        does: 'Drag pieces onto cells and rotate them, following the team\'s instructions in the right phase order.',
        cantSee: 'Where pieces go and how to rotate them.',
        talkTo: 'The Cryptographer (where), Navigator (rotation) and Strategist (when).',
      },
      hacker: {
        does: 'Verify the voltage when the team thinks it\'s done — it shows which pieces are right. Grant a re-scan if the Analyst needs it.',
        cantSee: 'The board and the pieces.',
        talkTo: 'The Engineer (ask when the board is ready) and the Analyst (re-scan).',
      },
    },
  },

  // ----------------------------------------------------------- 4. Signals
  4: {
    howTo: [
      'The core sends 4 encrypted words ("bursts"). Each one arrives from a different bearing and uses a different cipher.',
      'The Navigator, Cryptographer and Engineer capture each burst. The Hacker decrypts it with the right method and shift.',
      'When all 4 words are decrypted, the Hacker transmits them in the reading order the Strategist gives.',
    ],
    flow: [
      { from: 'navegador', to: 'criptografo', what: 'bearing (degrees) of each burst' },
      { from: 'criptografo', to: 'ingeniero', what: 'the channel to tune' },
      { from: 'criptografo', to: 'hacker', what: 'the cipher method of each burst' },
      { from: 'analista', to: 'hacker', what: 'the shift of each burst' },
      { from: 'estratega', to: 'hacker', what: 'the order to transmit the words' },
    ],
    tasks: {
      navegador: {
        does: 'Read the bearing (in degrees) of each burst to the Cryptographer.',
        cantSee: 'Channels, ciphers and shifts.',
        talkTo: 'The Cryptographer.',
      },
      analista: {
        does: 'Read the shift of each burst (how many letters its cipher moved) to the Hacker.',
        cantSee: 'Bearings, methods and the word order.',
        talkTo: 'The Hacker — say the burst name with its shift.',
      },
      criptografo: {
        does: 'Turn each bearing into a channel using your table, and tell the Hacker which cipher method each burst uses.',
        cantSee: 'The bearings and the shifts.',
        talkTo: 'The Navigator (bearings), the Engineer (channels) and the Hacker (methods).',
      },
      estratega: {
        does: 'Tell the Hacker the order in which the words must be transmitted.',
        cantSee: 'Anything about the bursts themselves.',
        talkTo: 'The Hacker — before they transmit.',
      },
      ingeniero: {
        does: 'Tune each burst to the channel the Cryptographer gives you. A wrong channel costs time.',
        cantSee: 'Bearings and the channel table.',
        talkTo: 'The Cryptographer — wait for the channel before tuning.',
      },
      hacker: {
        does: 'Decrypt each captured burst with the right method and shift, then transmit the 4 words in order.',
        cantSee: 'Methods, shifts and the word order. Teammates have to tell you.',
        talkTo: 'The Cryptographer (method), the Analyst (shift) and the Strategist (order).',
      },
    },
  },

  // -------------------------------------------------------------- 5. Bomb
  5: {
    howTo: [
      'Six wires, but only four must be cut, in a precise order. Two are decoys. You have 5:00, and 3 mistakes restart the module.',
      'The Cryptographer has the panel PIN in symbols; the Hacker converts it to digits and unlocks the panel.',
      'The Engineer is the only one who cuts, but can\'t see colors: the Navigator and Strategist say which position to cut next.',
    ],
    flow: [
      { from: 'criptografo', to: 'hacker', what: 'the PIN, in symbols' },
      { from: 'hacker', to: 'ingeniero', what: 'the panel is unlocked' },
      { from: 'analista', to: 'estratega', what: 'the two decoy colors' },
      { from: 'navegador', to: 'estratega', what: 'color of each wire position' },
      { from: 'estratega', to: 'ingeniero', what: 'which position to cut next' },
    ],
    tasks: {
      navegador: {
        does: 'Tell the team the color of each wire position.',
        cantSee: 'Which wires are decoys and the cutting order.',
        talkTo: 'The Strategist and the Engineer.',
      },
      analista: {
        does: 'Tell the team which two colors are decoys: they are never cut.',
        cantSee: 'The wire positions, the PIN and the priority order.',
        talkTo: 'The Strategist.',
      },
      criptografo: {
        does: 'Read the PIN symbols to the Hacker, in order.',
        cantSee: 'The symbol-to-digit table.',
        talkTo: 'The Hacker.',
      },
      estratega: {
        does: 'Use the color priority and skip the decoys to say which wire to cut next. Keep an eye on the clock.',
        cantSee: 'Wire colors and decoys — you need the Navigator and Analyst.',
        talkTo: 'The Navigator, the Analyst and the Engineer.',
      },
      ingeniero: {
        does: 'Cut the wires one by one, only after the panel is unlocked and the team agrees.',
        cantSee: 'The colors. You only see positions.',
        talkTo: 'The Strategist (next position) and the Hacker (panel unlocked?).',
      },
      hacker: {
        does: 'Convert the PIN symbols to digits with your table and type the PIN to unlock the panel.',
        cantSee: 'The PIN itself, in symbols.',
        talkTo: 'The Cryptographer — ask for the symbols one by one.',
      },
    },
  },

  // ------------------------------------------------------ 6. Glass Bridge
  6: {
    howTo: [
      'Cross a six-row bridge. Each row has a riddle with two possible answers, and each answer is a tile: one holds, one breaks.',
      'Solve every riddle together. Each role is the specialist of one kind of riddle and has a hint for those, so ask for it if you get stuck.',
      'Only the Strategist steps on the tiles, once the team agrees. Two broken tiles and the bridge restarts with new riddles.',
    ],
    flow: [
      { from: 'analista', to: 'estratega', what: 'hint for number riddles' },
      { from: 'criptografo', to: 'estratega', what: 'hint for word riddles' },
      { from: 'hacker', to: 'estratega', what: 'hint for logic riddles' },
      { from: 'navegador', to: 'estratega', what: 'hint for space riddles' },
      { from: 'ingeniero', to: 'estratega', what: 'hint for mechanics riddles' },
    ],
    tasks: {
      navegador: {
        does: 'Help solve every riddle. When a space riddle comes up (directions, turns, shapes), your hint appears.',
        cantSee: 'Hints for the other kinds of riddle.',
        talkTo: 'Everyone — discuss each riddle and share your hint out loud when it\'s yours.',
      },
      analista: {
        does: 'Help solve every riddle. When a number riddle comes up, your hint appears.',
        cantSee: 'Hints for the other kinds of riddle.',
        talkTo: 'Everyone — discuss each riddle and share your hint out loud when it\'s yours.',
      },
      criptografo: {
        does: 'Help solve every riddle. When a word or letter riddle comes up, your hint appears.',
        cantSee: 'Hints for the other kinds of riddle.',
        talkTo: 'Everyone — discuss each riddle and share your hint out loud when it\'s yours.',
      },
      estratega: {
        does: 'Step on the tile the team agrees on. You also have the hints for reasoning and probability riddles.',
        cantSee: 'Hints for the other kinds of riddle.',
        talkTo: 'Everyone — don\'t step until the team is convinced.',
      },
      ingeniero: {
        does: 'Help solve every riddle. When a mechanics riddle comes up (gears, pulleys, balance), your hint appears.',
        cantSee: 'Hints for the other kinds of riddle.',
        talkTo: 'Everyone — discuss each riddle and share your hint out loud when it\'s yours.',
      },
      hacker: {
        does: 'Help solve every riddle. When a logic riddle comes up, your hint appears.',
        cantSee: 'Hints for the other kinds of riddle.',
        talkTo: 'Everyone — discuss each riddle and share your hint out loud when it\'s yours.',
      },
    },
  },

  // ---------------------------------------------------------- final step
  7: {
    howTo: [
      'The six fragments you recovered are the position of the aircraft: latitude and longitude, each in degrees, minutes and seconds.',
      'Each of you knows one rule about how a position is written. Share your rule out loud.',
      'Place the fragments in the six slots in reading order, then verify. Anyone can place them.',
    ],
    flow: [
      { from: 'navegador', to: 'analista', what: 'how a position is written' },
      { from: 'analista', to: 'criptografo', what: 'which numbers are degrees' },
      { from: 'criptografo', to: 'estratega', what: 'which numbers are seconds' },
      { from: 'estratega', to: 'ingeniero', what: 'which numbers are minutes' },
      { from: 'ingeniero', to: 'hacker', what: 'latitude vs longitude minutes' },
    ],
    tasks: {
      navegador: { does: 'Share your rule ("Your clue" below), then help place the fragments.', cantSee: 'The other five rules.', talkTo: 'Everyone — put the rules together.' },
      analista: { does: 'Share your rule ("Your clue" below), then help place the fragments.', cantSee: 'The other five rules.', talkTo: 'Everyone — put the rules together.' },
      criptografo: { does: 'Share your rule ("Your clue" below), then help place the fragments.', cantSee: 'The other five rules.', talkTo: 'Everyone — put the rules together.' },
      estratega: { does: 'Share your rule ("Your clue" below), then help place the fragments.', cantSee: 'The other five rules.', talkTo: 'Everyone — put the rules together.' },
      ingeniero: { does: 'Share your rule ("Your clue" below), then help place the fragments.', cantSee: 'The other five rules.', talkTo: 'Everyone — put the rules together.' },
      hacker: { does: 'Share your rule ("Your clue" below), then help place the fragments.', cantSee: 'The other five rules.', talkTo: 'Everyone — put the rules together.' },
    },
  },
};
