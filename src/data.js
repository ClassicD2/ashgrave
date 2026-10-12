// ============================================================
// ASHGRAVE — game data
// Pure data. Nothing here depends on rendering.
// Can be exported as JSON and read by Godot as-is.
// ============================================================
var DATA = {
  monsters: {
    gnawer:     { name: 'Gnawer',     hp: 7,  dmg: [1, 3], speed: 3.7, range: 0.55, atkTime: 0.28, atkCd: 0.9, xp: 6,  r: 0.27, ai: 'melee',  aggro: 9 },
    bonewalker: { name: 'Bonewalker', hp: 24, dmg: [3, 6], speed: 2.1, range: 0.7,  atkTime: 0.45, atkCd: 1.4, xp: 14, r: 0.33, ai: 'melee',  aggro: 8 },
    judge:      { name: 'The Hollow Judge', hp: 240, dmg: [6, 10], speed: 2.0, range: 0.9, atkTime: 0.45, atkCd: 1.3, xp: 500, r: 0.45, ai: 'judge', aggro: 14,
                  abilities: ['Judgement', 'Shadow Step', 'Bloodless'] },
    abbot:      { name: 'The Ember Abbot', hp: 140, dmg: [4, 8], speed: 1.7, range: 0.9, atkTime: 0.5, atkCd: 1.6, xp: 400, r: 0.45, ai: 'abbot', aggro: 10, boltSpeed: 6.5,
                  abilities: ['Fireball Volley', 'Withering Curse'] },
    gravewarden: { name: 'The Gravewarden', hp: 225, dmg: [5, 8], speed: 1.9, range: 0.95, atkTime: 0.5, atkCd: 1.5, xp: 320, r: 0.45, ai: 'warden', aggro: 7,
                  abilities: ['Bone Spikes', 'Raise the Dead'] },
    ashpriest:  { name: 'Ash Priest', hp: 16, dmg: [4, 7], speed: 2.0, range: 7,    atkTime: 0.6,  atkCd: 2.3, xp: 20, r: 0.31, ai: 'caster', aggro: 9, boltSpeed: 7.5 }
  },

  // Packs: which monsters spawn together, weight, minimum depth
  packs: [
    { w: 4, minDepth: 1, units: [['gnawer', 3, 5]] },
    { w: 4, minDepth: 1, units: [['bonewalker', 2, 3]] },
    { w: 2, minDepth: 1, units: [['ashpriest', 1, 1], ['bonewalker', 1, 2]] },
    { w: 2, minDepth: 2, units: [['ashpriest', 2, 2], ['gnawer', 2, 3]] }
  ],

  // Difficulty by dungeon level d: multiplier = (1 + linear*(d-1)) * growth^(d-1)
  // party: extra per player beyond the first.
  scaling: {
    hp:  { linear: 0.45, growth: 1.08 },
    dmg: { linear: 0.3,  growth: 1.04 },
    xp:  { linear: 0.35, growth: 1.03 },
    party: { hp: 0.7, dmg: 0.1 }
  },

  // Champion packs: chance per pack by depth (index = depth, last value repeats).
  // Depth 1 has none, and the room nearest the start never gets one.
  championChance: [0, 0, 0.06, 0.1, 0.12],

  // Classes: which attributes they use, how they grow and what they start with.
  classes: {
    archer: {
      name: 'Archer', weapon: 'bow', primary: 'dex', attrs: ['dex', 'vit', 'ene'],
      base: { dex: 15, vit: 12, ene: 8 },
      life: { base: 30, perLevel: 3, perVit: 3 }, mana: { base: 10, perLevel: 1, perEne: 2 },
      skill: 'multishot', start: { weapon: 'short_bow', chest: 'leather_coat' }
    },
    warrior: {
      name: 'Warrior', weapon: 'melee', primary: 'str', attrs: ['str', 'vit', 'ene'],
      base: { str: 20, vit: 18, ene: 6 },
      life: { base: 40, perLevel: 4, perVit: 4 }, mana: { base: 6, perLevel: 1, perEne: 1.5 },
      skill: 'cleave', reach: 0.75, dr: 0.15, start: { weapon: 'short_sword', chest: 'leather_coat', helm: 'hood' }
    },
    // Mid range, control and mana. Energy raises spell damage; Arcane Ward pays part of every hit with mana.
    mage: {
      name: 'Mage', weapon: 'staff', primary: 'ene', attrs: ['ene', 'vit'],
      base: { ene: 20, vit: 12, dex: 8 },
      life: { base: 26, perLevel: 3, perVit: 3 }, mana: { base: 20, perLevel: 2, perEne: 2 },
      skill: 'nova', ward: 0.25, start: { weapon: 'gnarled_staff', chest: 'leather_coat' }
    }
  },
  attrNames: { str: 'Strength', dex: 'Dexterity', vit: 'Vitality', ene: 'Energy' },
  skills: {
    multishot: { name: 'Multishot', mana: 5, arrows: 5, spread: 0.16, mult: 0.7, desc: 'Five arrows in a fan.' },
    cleave:    { name: 'Cleave',    mana: 4, arc: 2.1, reach: 1.9, mult: 1.15, desc: 'Strike every enemy in an arc in front of you.' },
    nova:      { name: 'Nova', mana: 6, radius: 3, mult: 0.9, push: 1.3, desc: 'A ring of force around you that strikes every enemy within 3 tiles and throws them back.' },
    // Nightstalker only: a patch of falling arrows at the cursor. Damage per half second = pct x your average hit.
    rain:      { name: 'Rain of Arrows', mana: 7, radius: 1.8, dur: 3, tick: 0.5, pct: 0.45, cooldown: 1.5, desc: 'Arrows rain on an area you can see, dealing dark damage over 3 seconds. 1.5 second cooldown.' }
  },

  // Ascendancy: a path chosen at the altar after the Trial of Ash. The path changes your main
  // attack and your skill (its core); tree points (one per two levels) buy ranks in its nodes.
  // Node text: {v} is replaced by rank x per (the node's current total).
  ascendancy: {
    firstLevel: 10,   // one point per level from level 10 (level 14 = 5 points), once the Trial is passed
    treeVersion: 2,   // bump when ranks change: saved trees are refunded
    sideBonus: 0.2, // light paths deal +20% light damage, dark paths +20% dark damage
    renounceCost: 5000
  },
  ascendancies: {
    templar: {
      name: 'Templar', cls: 'warrior', side: 'light', skill: 'cleave',
      lore: 'An oath made of iron. Every blow carries on to the next foe, and Cleave feeds the fervor.',
      core: { name: 'Chain of Light',
        desc: 'Your attacks leap to two more enemies, each leap dealing 50% of the blow. Cleave grants Zeal: +25% attack speed for 3 seconds.',
        chain: { bounces: 2, pct: 0.5, range: 4 }, zeal: { ias: 0.25, dur: 3 } },
      nodes: [
        { id: 'bright_leap', name: 'Bright Leap', max: 6, per: 5, desc: 'Leaps deal +{v}% more of the blow.' },
        { id: 'fervor', name: 'Fervor', max: 6, per: 5, desc: 'Zeal grants +{v}% more attack speed.' },
        { id: 'long_vigil', name: 'Long Vigil', max: 5, per: 0.4, desc: 'Zeal lasts {v}s longer.' },
        { id: 'bulwark', name: 'Bulwark', max: 6, per: 3, desc: '{v}% chance to block a blow entirely.' },
        { id: 'hallowed_plate', name: 'Hallowed Plate', max: 6, per: 2.5, desc: '+{v}% armor.' },
        { id: 'consecrate', name: 'Consecrate', max: 1, per: 1, req: 8, desc: 'Cleave leaves holy ground for 3 seconds. Allies on it heal 3% of their life each second.', dur: 3, radius: 1.6, pct: 0.03 },
        { id: 'aegis', name: 'Aegis', max: 1, per: 1, req: 4, desc: 'You resurrect allies in 1 second, and they rise with 75% life.', channel: 1, life: 0.75 },
        { id: 'radiant_chain', name: 'Radiant Chain', max: 1, per: 1, req: 16, desc: 'Chain of Light leaps to two more enemies.', bounces: 2 }
      ]
    },
    reaver: {
      name: 'Reaver', cls: 'warrior', side: 'dark', skill: 'cleave',
      lore: 'Opens wounds and lets them work. Cleave tears them wide in one bloody stroke.',
      core: { name: 'Rend',
        desc: 'Each attack adds a Rend stack that deals 40% of the hit as dark damage over 4 seconds, up to 5 stacks. Cleave rips Rends open: their remaining damage lands at once, plus 50%.',
        rend: { pct: 0.4, dur: 4, max: 5 }, rip: 1.5 },
      nodes: [
        { id: 'reaping_arc', name: 'Reaping Arc', max: 5, per: 10, desc: 'Cleave covers +{v}% more area.' },
        { id: 'executioner', name: 'Executioner', max: 6, per: 5, desc: 'Your attacks deal +{v}% damage.' },
        { id: 'deep_wounds', name: 'Deep Wounds', max: 3, per: 1, desc: 'Rend stacks up to {v} more times.' },
        { id: 'bloodied', name: 'Bloodied Hands', max: 5, per: 0.3, desc: 'Each attack that lands heals {v}% of your life.' },
        { id: 'rage', name: 'Rage', max: 5, per: 6, desc: '+{v}% attack speed while below half life.' },
        { id: 'blood_price', name: 'Blood Price', max: 1, per: 1, req: 8, desc: 'Cleave costs 6% of your life instead of mana and deals 25% more damage.', pct: 0.06, mult: 1.25 },
        { id: 'exsanguinate', name: 'Exsanguinate', max: 1, per: 1, req: 16, desc: 'Ripped Rends deal 250% of their remaining damage instead of 150%, and heal you for 10% of it.', rip: 2.5, heal: 0.1 },
        { id: 'bloodlust', name: 'Bloodlust', max: 1, per: 1, req: 4, desc: 'Each kill gives +5% damage for 5 seconds, stacking up to five times.', pct: 0.05, dur: 5, stacks: 5 }
      ]
    },
    sunwarden: {
      name: 'Sunwarden', cls: 'archer', side: 'light', skill: 'multishot',
      lore: 'Carries the dawn into the deep. Draws the bow long and lets the light go through everything.',
      core: { name: 'Lantern Soul',
        desc: '+2 light radius. Your arrows pierce one enemy, losing 50% damage per pierce. Hold Multishot to draw it: at full draw (2 seconds) it deals +50% damage and pierces 2 more enemies.',
        light: 2, pierce: 1, pierceKeep: 0.5, charge: { min: 0, full: 2, dmg: 0.5, pierce: 2 } },
      nodes: [
        { id: 'focused_draw', name: 'Focused Draw', max: 7, per: 6, desc: 'A full draw deals +{v}% more damage.' },
        { id: 'quick_draw', name: 'Quick Draw', max: 6, per: 0.1, desc: 'A full draw takes {v}s less.' },
        { id: 'piercing_light', name: 'Piercing Light', max: 7, per: 4, desc: 'Arrows keep +{v}% more damage after each pierce.' },
        { id: 'sun_evasion', name: 'Sidestep', max: 7, per: 2, desc: '{v}% chance to dodge an attack.' },
        { id: 'radiant_volley', name: 'Radiant Volley', max: 1, per: 1, req: 16, desc: 'Multishot fires seven arrows instead of five.', arrows: 7 },
        { id: 'dawn_aura', name: 'Dawn Aura', max: 1, per: 1, req: 8, desc: 'Enemies inside your light are scorched every half second for 8% of your average hit.', tick: 0.5, pct: 0.08 },
        { id: 'beacon', name: 'Beacon', max: 1, per: 1, req: 4, desc: 'Allies inside your light, you included, regenerate 2% of their life each second.', pct: 0.02 }
      ]
    },
    nightstalker: {
      name: 'Nightstalker', cls: 'archer', side: 'dark', skill: 'rain',
      lore: 'Moves where the light thins. Arrows that keep hurting, and a sky that rains shadow.',
      core: { name: 'Black Arrows',
        desc: 'Sleeping enemies notice you at 60% of the usual distance. Your arrows deal 30% of the hit as extra dark damage over 3 seconds. Multishot becomes Rain of Arrows.',
        aggro: 0.6, blackPct: 0.3 },
      nodes: [
        { id: 'wide_rain', name: 'Wide Rain', max: 7, per: 6, desc: 'Rain of Arrows covers a +{v}% larger radius.' },
        { id: 'grasping_dark', name: 'Grasping Dark', max: 6, per: 5, desc: 'Enemies in the rain are slowed by {v}%.' },
        { id: 'long_night', name: 'Long Night', max: 6, per: 0.3, desc: 'Rain of Arrows lasts {v}s longer.' },
        { id: 'night_evasion', name: 'Shadowstep', max: 7, per: 2, desc: '{v}% chance to dodge an attack.' },
        { id: 'from_the_dark', name: 'From the Dark', max: 1, per: 1, req: 16, desc: 'Your first hit on an enemy that has not noticed you deals 250% damage.', mult: 2.5 },
        { id: 'fade', name: 'Fade', max: 1, per: 1, req: 4, desc: 'When you kill an enemy, others within 8 tiles lose track of you for 2 seconds. Bosses are not fooled.', range: 8, dur: 2 },
        { id: 'mark_for_death', name: 'Mark for Death', max: 1, per: 1, req: 8, desc: 'Enemies you hit take 15% more damage from your allies for 4 seconds.', pct: 0.15, dur: 4 }
      ]
    },
    lightbinder: {
      name: 'Lightbinder', cls: 'mage', side: 'light', skill: 'nova',
      lore: 'Keeps the light around the ones who stand with her. Nova becomes a shield as much as a blow.',
      core: { name: 'Radiant Ward',
        desc: 'Nova shields you and every ally within its ring for 15% of your life for 4 seconds.',
        shield: { pct: 0.15, dur: 4 } },
      nodes: [
        { id: 'radiant_shield', name: 'Radiant Shield', max: 7, per: 10, desc: 'Nova shields absorb +{v}% more.' },
        { id: 'wide_nova', name: 'Wide Nova', max: 7, per: 5, desc: 'Nova reaches +{v}% further.' },
        { id: 'clear_mind', name: 'Clear Mind', max: 5, per: 0.6, desc: 'Nova costs {v} less mana.' },
        { id: 'dazzle', name: 'Dazzle', max: 6, per: 0.3, desc: 'Enemies struck by Nova lose track of you for {v}s. Bosses are not fooled.' },
        { id: 'blink', name: 'Blink', max: 1, per: 1, req: 4, desc: 'Nova first carries you to the cursor (up to 6 tiles, where you can see), then bursts there.', range: 6 },
        { id: 'sanctuary', name: 'Sanctuary', max: 1, per: 1, req: 8, desc: 'Nova leaves holy ground for 3 seconds. Allies on it heal 3% of their life each second.', dur: 3, radius: 2, pct: 0.03 },
        { id: 'prism', name: 'Prism', max: 1, per: 1, req: 16, desc: 'Spark splits into two more sparks when it hits, each dealing 50%.', pct: 0.5 }
      ]
    },
    voidcaller: {
      name: 'Voidcaller', cls: 'mage', side: 'dark', skill: 'nova',
      lore: 'Pulls the world in and lets it rot. What dies in the Decay passes it on.',
      core: { name: 'Decay',
        desc: 'Nova pulls enemies toward you instead of throwing them back, and afflicts them with Decay: 60% of your hit as dark damage over 4 seconds. When an enemy dies in Decay, it passes to the nearest enemy.',
        pull: true, decay: { pct: 0.6, dur: 4, spread: 3 } },
      nodes: [
        { id: 'virulence', name: 'Virulence', max: 7, per: 8, desc: 'Decay deals +{v}% damage.' },
        { id: 'lingering', name: 'Lingering Rot', max: 6, per: 0.5, desc: 'Decay lasts {v}s longer.' },
        { id: 'event_horizon', name: 'Event Horizon', max: 7, per: 5, desc: 'Nova pulls from +{v}% further.' },
        { id: 'withering', name: 'Withering', max: 6, per: 5, desc: 'Enemies in Decay are slowed by {v}%.' },
        { id: 'siphon', name: 'Siphon', max: 1, per: 1, req: 4, desc: 'Each Spark that hits restores 2 mana.', mana: 2 },
        { id: 'contagion', name: 'Contagion', max: 1, per: 1, req: 8, desc: 'Decay passes on to two enemies at full strength when its host dies.' },
        { id: 'collapse', name: 'Collapse', max: 1, per: 1, req: 16, desc: 'Every second Nova crushes the enemies it pulls in for 200% of your hit.', mult: 2 }
      ]
    }
  },

  // Unique items (rarity 3). mods: [min, max] or a fixed number. Special keys are read by the engine:
  // pierce, multiArrows, rainDur, stealth (% later noticed), dodge, block, dr (% less damage), zealDur,
  // ripPct, chainPct, cleaveArea, rendMax, darkFast (dark lands in 2s), darkKillMana, hitHeal (% life per hit),
  // noSlow, and node_<id> (+ranks to that tree node, above its max).
  uniqueRules: { minIlvl: 12, chance: 0.015, mini: 0.08, boss: 0.2, trial: 0.15 },
  uniques: [
    { id: 'dawnpiercer', name: 'Dawnpiercer', base: 'war_bow', cls: 'archer', mods: { dmgPct: [50, 70], lightMin: [5, 7], lightMax: [9, 12], dex: 8, pierce: 1, node_focused_draw: 1 },
      fx: ['Arrows pierce 1 more enemy', '+1 to Focused Draw (Sunwarden)'] },
    { id: 'veil_of_gloom', name: 'Veil of Gloom', base: 'storm_hood', cls: 'archer', mods: { dex: [10, 15], life: [20, 30], stealth: 20 },
      fx: ['Sleeping enemies notice you 20% later'] },
    { id: 'wanderers_mantle', name: "Wanderer's Mantle", base: 'ring_mail', cls: 'archer', mods: { armorPct: [40, 60], run: 10, dodge: 8 },
      fx: ['8% chance to dodge an attack'] },
    { id: 'fletchers_grips', name: "Fletcher's Grips", base: 'gloves', cls: 'archer', mods: { ias: 15, dex: [5, 8], multiArrows: 2 },
      fx: ['Multishot fires 2 more arrows'] },
    { id: 'shadowstride', name: 'Shadowstride', base: 'boots', cls: 'archer', mods: { run: 20, life: [15, 20], rainDur: 1, node_night_evasion: 1 },
      fx: ['Rain of Arrows lasts 1s longer', '+1 to Shadowstep (Nightstalker)'] },
    { id: 'eye_of_the_long_night', name: 'Eye of the Long Night', base: 'amulet', cls: 'archer', mods: { darkMin: [6, 9], darkMax: [10, 15], mana: 15, darkFast: 1 },
      fx: ['Your dark damage lands in 2 seconds instead of 3'] },
    { id: 'sunspark_loop', name: 'Sunspark Loop', base: 'ring', cls: 'archer', mods: { lightMin: [2, 4], lightMax: [5, 8], mana: 10, light: 2, node_piercing_light: 1 },
      fx: ['+1 to Piercing Light (Sunwarden)'] },
    { id: 'nightglass_band', name: 'Nightglass Band', base: 'ring', cls: 'archer', mods: { darkMin: [3, 5], darkMax: [6, 9], leech: 4, darkKillMana: 3 },
      fx: ['Enemies killed by your dark damage give 3 mana'] },
    { id: 'oathbreaker', name: 'Oathbreaker', base: 'great_sword', cls: 'warrior', mods: { dmgPct: [60, 80], darkMin: [5, 8], darkMax: [9, 14], str: 8, rendMax: 1, cleaveArea: 20 },
      fx: ['Rend stacks 1 more time (Reaver)', 'Cleave covers 20% more area'] },
    { id: 'crown_of_vigil', name: 'Crown of Vigil', base: 'helm', cls: 'warrior', mods: { armorPct: [50, 70], life: [20, 30], block: 10 },
      fx: ['10% chance to block a blow entirely'] },
    { id: 'bastion', name: 'Bastion of the Last Oath', base: 'plate', cls: 'warrior', mods: { armorPct: [70, 90], life: [30, 40], dr: 5 },
      fx: ['You take 5% less damage'] },
    { id: 'zealots_gauntlets', name: "Zealot's Gauntlets", base: 'chain_gloves', cls: 'warrior', mods: { ias: 15, lightMin: [2, 3], lightMax: [4, 7], zealDur: 1, node_fervor: 1 },
      fx: ['Zeal lasts 1s longer (Templar)', '+1 to Fervor (Templar)'] },
    { id: 'ironmarch', name: 'Ironmarch Greaves', base: 'iron_boots', cls: 'warrior', mods: { armorPct: 40, run: 10, noSlow: 1 },
      fx: ['You cannot be slowed'] },
    { id: 'heart_of_the_reaver', name: 'Heart of the Reaver', base: 'amulet', cls: 'warrior', mods: { str: [10, 15], leech: 5, ripPct: 25 },
      fx: ['Rip Open deals 25% more damage (Reaver)'] },
    { id: 'bright_vow', name: 'Ring of the Bright Vow', base: 'ring', cls: 'warrior', mods: { lightMin: [3, 5], lightMax: [6, 10], life: 15, chainPct: 10, node_bright_leap: 1 },
      fx: ['Chain of Light leaps deal 10% more (Templar)', '+1 to Bright Leap (Templar)'] },
    { id: 'bloodsigil', name: 'Bloodsigil', base: 'ring', cls: 'warrior', mods: { darkMin: [3, 5], darkMax: [6, 10], str: 3, hitHeal: 1 },
      fx: ['Each hit heals 1% of your life'] }
  ],

  // wclass: which class can wield a weapon
  bases: [
    { id: 'short_bow',     name: 'Short Bow',     slot: 'weapon', wclass: 'bow',   ilvl: 1,  dmg: [2, 5],   aps: 1.5 },
    { id: 'hunters_bow',   name: "Hunter's Bow",  slot: 'weapon', wclass: 'bow',   ilvl: 3,  dmg: [3, 8],   aps: 1.45 },
    { id: 'long_bow',      name: 'Long Bow',      slot: 'weapon', wclass: 'bow',   ilvl: 6,  dmg: [4, 12],  aps: 1.35 },
    { id: 'composite_bow', name: 'Composite Bow', slot: 'weapon', wclass: 'bow',   ilvl: 9,  dmg: [6, 14],  aps: 1.5 },
    { id: 'war_bow',       name: 'War Bow',       slot: 'weapon', wclass: 'bow',   ilvl: 13, dmg: [9, 20],  aps: 1.4 },
    { id: 'short_sword',   name: 'Short Sword',   slot: 'weapon', wclass: 'melee', ilvl: 1,  dmg: [2, 6],   aps: 1.45 },
    { id: 'hand_axe',      name: 'Hand Axe',      slot: 'weapon', wclass: 'melee', ilvl: 3,  dmg: [3, 8],   aps: 1.35 },
    { id: 'mace',          name: 'Mace',          slot: 'weapon', wclass: 'melee', ilvl: 5,  dmg: [5, 10],  aps: 1.25 },
    { id: 'broad_sword',   name: 'Broad Sword',   slot: 'weapon', wclass: 'melee', ilvl: 7,  dmg: [6, 13],  aps: 1.35 },
    { id: 'war_axe',       name: 'War Axe',       slot: 'weapon', wclass: 'melee', ilvl: 10, dmg: [8, 17],  aps: 1.2 },
    { id: 'great_sword',   name: 'Great Sword',   slot: 'weapon', wclass: 'melee', ilvl: 13, dmg: [11, 22], aps: 1.2 },
    { id: 'gnarled_staff', name: 'Gnarled Staff', slot: 'weapon', wclass: 'staff', ilvl: 1,  dmg: [2, 5],   aps: 1.35 },
    { id: 'ashen_staff',   name: 'Ashen Staff',   slot: 'weapon', wclass: 'staff', ilvl: 3,  dmg: [3, 7],   aps: 1.35 },
    { id: 'rune_staff',    name: 'Rune Staff',    slot: 'weapon', wclass: 'staff', ilvl: 6,  dmg: [4, 11],  aps: 1.3 },
    { id: 'bone_staff',    name: 'Bone Staff',    slot: 'weapon', wclass: 'staff', ilvl: 9,  dmg: [6, 13],  aps: 1.35 },
    { id: 'battle_staff',  name: 'Battle Staff',  slot: 'weapon', wclass: 'staff', ilvl: 13, dmg: [8, 19],  aps: 1.3 },
    { id: 'hood',          name: 'Hood',          slot: 'helm',   ilvl: 1,  armor: [2, 4] },
    { id: 'helm',          name: 'Helm',          slot: 'helm',   ilvl: 4,  armor: [5, 8] },
    { id: 'storm_hood',    name: 'Storm Hood',    slot: 'helm',   ilvl: 9,  armor: [9, 14] },
    { id: 'leather_coat',  name: 'Leather Coat',  slot: 'chest',  ilvl: 1,  armor: [5, 9] },
    { id: 'ring_mail',     name: 'Ring Mail',     slot: 'chest',  ilvl: 4,  armor: [10, 16] },
    { id: 'plate',         name: 'Plate',         slot: 'chest',  ilvl: 9,  armor: [18, 28] },
    { id: 'gloves',        name: 'Gloves',        slot: 'gloves', ilvl: 1,  armor: [1, 3] },
    { id: 'chain_gloves',  name: 'Chain Gloves',  slot: 'gloves', ilvl: 5,  armor: [3, 6] },
    { id: 'boots',         name: 'Boots',         slot: 'boots',  ilvl: 1,  armor: [1, 3] },
    { id: 'iron_boots',    name: 'Iron Boots',    slot: 'boots',  ilvl: 5,  armor: [3, 6] },
    // Nightmare and Hell bases (item level 15+)
    { id: 'recurve_bow',   name: 'Recurve Bow',   slot: 'weapon', wclass: 'bow',   ilvl: 18, dmg: [12, 26], aps: 1.5 },
    { id: 'ashwood_bow',   name: 'Ashwood Bow',   slot: 'weapon', wclass: 'bow',   ilvl: 24, dmg: [15, 33], aps: 1.45 },
    { id: 'grave_bow',     name: 'Grave Bow',     slot: 'weapon', wclass: 'bow',   ilvl: 31, dmg: [19, 41], aps: 1.4 },
    { id: 'ember_longbow', name: 'Ember Longbow', slot: 'weapon', wclass: 'bow',   ilvl: 40, dmg: [24, 52], aps: 1.45 },
    { id: 'warlock_staff', name: 'Warlock Staff', slot: 'weapon', wclass: 'staff', ilvl: 18, dmg: [11, 24], aps: 1.35 },
    { id: 'grave_staff',   name: 'Grave Staff',   slot: 'weapon', wclass: 'staff', ilvl: 24, dmg: [14, 31], aps: 1.3 },
    { id: 'obsidian_staff', name: 'Obsidian Staff', slot: 'weapon', wclass: 'staff', ilvl: 31, dmg: [18, 39], aps: 1.3 },
    { id: 'ember_staff',   name: 'Ember Staff',   slot: 'weapon', wclass: 'staff', ilvl: 40, dmg: [23, 49], aps: 1.35 },
    { id: 'bastard_sword', name: 'Bastard Sword', slot: 'weapon', wclass: 'melee', ilvl: 18, dmg: [14, 28], aps: 1.3 },
    { id: 'battle_axe',    name: 'Battle Axe',    slot: 'weapon', wclass: 'melee', ilvl: 24, dmg: [17, 36], aps: 1.2 },
    { id: 'war_hammer',    name: 'War Hammer',    slot: 'weapon', wclass: 'melee', ilvl: 31, dmg: [23, 44], aps: 1.15 },
    { id: 'executioner_sword', name: 'Executioner Sword', slot: 'weapon', wclass: 'melee', ilvl: 40, dmg: [28, 56], aps: 1.25 },
    { id: 'great_helm',    name: 'Great Helm',    slot: 'helm',   ilvl: 16, armor: [16, 22] },
    { id: 'bone_visor',    name: 'Bone Visor',    slot: 'helm',   ilvl: 26, armor: [24, 32] },
    { id: 'crown_of_ash',  name: 'Crown of Ash',  slot: 'helm',   ilvl: 38, armor: [33, 44] },
    { id: 'scale_mail',    name: 'Scale Mail',    slot: 'chest',  ilvl: 15, armor: [30, 40] },
    { id: 'gothic_plate',  name: 'Gothic Plate',  slot: 'chest',  ilvl: 26, armor: [42, 56] },
    { id: 'ashen_plate',   name: 'Ashen Plate',   slot: 'chest',  ilvl: 38, armor: [58, 76] },
    { id: 'gauntlets',     name: 'Gauntlets',     slot: 'gloves', ilvl: 15, armor: [7, 10] },
    { id: 'war_gauntlets', name: 'War Gauntlets', slot: 'gloves', ilvl: 27, armor: [11, 15] },
    { id: 'ember_grips',   name: 'Ember Grips',   slot: 'gloves', ilvl: 39, armor: [16, 21] },
    { id: 'greaves',       name: 'Greaves',       slot: 'boots',  ilvl: 15, armor: [7, 10] },
    { id: 'war_boots',     name: 'War Boots',     slot: 'boots',  ilvl: 27, armor: [11, 15] },
    { id: 'ember_treads',  name: 'Ember Treads',  slot: 'boots',  ilvl: 39, armor: [16, 21] },
    { id: 'ring',          name: 'Ring',          slot: 'ring',   ilvl: 1 },
    { id: 'amulet',        name: 'Amulet',        slot: 'amulet', ilvl: 1 }
  ],

  // mods: stat -> [min, max]
  affixes: [
    { id: 'dmg', kind: 'prefix', slots: ['weapon'], tiers: [
      { ilvl: 1,  name: 'Sharp',   mods: { dmgPct: [10, 20] } },
      { ilvl: 5,  name: 'Cruel',   mods: { dmgPct: [21, 40] } },
      { ilvl: 10, name: 'Ghastly', mods: { dmgPct: [41, 70] } },
      { ilvl: 18, name: 'Savage',      mods: { dmgPct: [71, 100] } },
      { ilvl: 30, name: 'Merciless',   mods: { dmgPct: [101, 140] } },
      { ilvl: 42, name: 'Cataclysmic', mods: { dmgPct: [141, 190] } } ] },
    // Light: added to every hit at once. Set a little under the old fire values; light paths get +20% on top.
    { id: 'light', kind: 'prefix', slots: ['weapon', 'ring', 'gloves'], tiers: [
      { ilvl: 1,  name: 'Gleaming',  mods: { lightMin: [1, 2], lightMax: [3, 4] } },
      { ilvl: 5,  name: 'Radiant',   mods: { lightMin: [3, 4], lightMax: [6, 9] } },
      { ilvl: 10, name: 'Hallowed',  mods: { lightMin: [5, 8], lightMax: [11, 17] } },
      { ilvl: 18, name: 'Dawnlit',   mods: { lightMin: [9, 12], lightMax: [18, 26] } },
      { ilvl: 30, name: 'Sunforged', mods: { lightMin: [13, 19], lightMax: [26, 38] } },
      { ilvl: 42, name: 'Seraphic',  mods: { lightMin: [20, 27], lightMax: [39, 55] } } ] },
    // Dark: dealt over rules.darkDuration seconds after the hit. More in total than light, but slower; dark paths get +20%.
    { id: 'dark', kind: 'prefix', slots: ['weapon', 'ring', 'gloves'], tiers: [
      { ilvl: 1,  name: 'Shadowed',    mods: { darkMin: [1, 3], darkMax: [4, 6] } },
      { ilvl: 5,  name: 'Umbral',      mods: { darkMin: [4, 6], darkMax: [8, 13] } },
      { ilvl: 10, name: 'Gloomforged', mods: { darkMin: [7, 10], darkMax: [15, 23] } },
      { ilvl: 18, name: 'Nightborn',   mods: { darkMin: [12, 16], darkMax: [24, 35] } },
      { ilvl: 30, name: 'Abyssal',     mods: { darkMin: [17, 25], darkMax: [36, 52] } },
      { ilvl: 42, name: 'Voidtouched', mods: { darkMin: [26, 37], darkMax: [53, 75] } } ] },
    { id: 'armor', kind: 'prefix', slots: ['helm', 'chest', 'gloves', 'boots'], tiers: [
      { ilvl: 1,  name: 'Sturdy',     mods: { armorPct: [10, 20] } },
      { ilvl: 5,  name: 'Strong',     mods: { armorPct: [21, 40] } },
      { ilvl: 10, name: 'Unyielding', mods: { armorPct: [41, 70] } },
      { ilvl: 18, name: 'Bastion',    mods: { armorPct: [71, 100] } },
      { ilvl: 30, name: 'Adamant',    mods: { armorPct: [101, 140] } },
      { ilvl: 42, name: 'Godforged',  mods: { armorPct: [141, 180] } } ] },
    { id: 'leech', kind: 'prefix', slots: ['weapon', 'ring'], tiers: [
      { ilvl: 3, name: 'Bloody',   mods: { leech: [2, 4] } },
      { ilvl: 9, name: 'Vampiric', mods: { leech: [5, 8] } },
      { ilvl: 20, name: 'Bloodthirsty',   mods: { leech: [9, 12] } },
      { ilvl: 36, name: 'Exsanguinating', mods: { leech: [13, 16] } } ] },

    { id: 'life', kind: 'suffix', slots: ['helm', 'chest', 'boots', 'ring', 'amulet', 'gloves'], tiers: [
      { ilvl: 1, name: 'of the Wolf',  mods: { life: [5, 10] } },
      { ilvl: 4, name: 'of the Bear',  mods: { life: [11, 20] } },
      { ilvl: 9, name: 'of the Giant', mods: { life: [21, 35] } },
      { ilvl: 16, name: 'of the Colossus',  mods: { life: [36, 55] } },
      { ilvl: 28, name: 'of the Leviathan', mods: { life: [56, 80] } },
      { ilvl: 40, name: 'of the Undying',   mods: { life: [81, 110] } } ] },
    { id: 'mana', kind: 'suffix', slots: ['helm', 'ring', 'amulet', 'gloves'], tiers: [
      { ilvl: 1, name: 'of the Owl', mods: { mana: [5, 10] } },
      { ilvl: 6, name: 'of Wisdom',  mods: { mana: [11, 20] } },
      { ilvl: 16, name: 'of the Sage',     mods: { mana: [21, 35] } },
      { ilvl: 30, name: 'of the Archmage', mods: { mana: [36, 55] } } ] },
    { id: 'dex', kind: 'suffix', slots: ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet'], tiers: [
      { ilvl: 1,  name: 'of the Stag',   mods: { dex: [2, 5] } },
      { ilvl: 5,  name: 'of the Falcon', mods: { dex: [6, 10] } },
      { ilvl: 10, name: 'of the Eagle',  mods: { dex: [11, 16] } },
      { ilvl: 18, name: 'of the Hawk',  mods: { dex: [17, 22] } },
      { ilvl: 32, name: 'of Precision', mods: { dex: [23, 30] } } ] },
    { id: 'str', kind: 'suffix', slots: ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet'], tiers: [
      { ilvl: 1,  name: 'of the Ox',    mods: { str: [2, 5] } },
      { ilvl: 5,  name: 'of the Bull',  mods: { str: [6, 10] } },
      { ilvl: 10, name: 'of the Titan', mods: { str: [11, 16] } },
      { ilvl: 18, name: 'of Might',        mods: { str: [17, 22] } },
      { ilvl: 32, name: 'of the Behemoth', mods: { str: [23, 30] } } ] },
    { id: 'vit', kind: 'suffix', slots: ['helm', 'chest', 'boots', 'ring', 'amulet'], tiers: [
      { ilvl: 1, name: 'of the Oak',      mods: { vit: [2, 5] } },
      { ilvl: 6, name: 'of the Mountain', mods: { vit: [6, 12] } },
      { ilvl: 16, name: 'of the Ancients', mods: { vit: [13, 20] } },
      { ilvl: 30, name: 'of the Earth',    mods: { vit: [21, 30] } } ] },
    { id: 'ene', kind: 'suffix', slots: ['helm', 'ring', 'amulet'], tiers: [
      { ilvl: 1, name: 'of the Moon',  mods: { ene: [2, 5] } },
      { ilvl: 6, name: 'of the Stars', mods: { ene: [6, 12] } },
      { ilvl: 16, name: 'of the Void',   mods: { ene: [13, 20] } },
      { ilvl: 30, name: 'of the Cosmos', mods: { ene: [21, 30] } } ] },
    { id: 'ias', kind: 'suffix', slots: ['weapon', 'gloves'], tiers: [
      { ilvl: 2, name: 'of Swiftness', mods: { ias: [5, 10] } },
      { ilvl: 8, name: 'of Haste',     mods: { ias: [11, 20] } },
      { ilvl: 18, name: 'of Fury',   mods: { ias: [21, 30] } },
      { ilvl: 34, name: 'of Frenzy', mods: { ias: [31, 40] } } ] },
    { id: 'run', kind: 'suffix', slots: ['boots'], tiers: [
      { ilvl: 1, name: 'of the Wind',  mods: { run: [10, 15] } },
      { ilvl: 6, name: 'of the Storm', mods: { run: [16, 25] } },
      { ilvl: 20, name: 'of the Tempest', mods: { run: [26, 35] } } ] },
    { id: 'light', kind: 'suffix', slots: ['helm', 'ring', 'amulet'], tiers: [
      { ilvl: 1, name: 'of Light',   mods: { light: [1, 1] } },
      { ilvl: 7, name: 'of the Sun', mods: { light: [2, 2] } } ] },
    { id: 'gold', kind: 'suffix', slots: ['ring', 'amulet', 'boots', 'gloves'], tiers: [
      { ilvl: 1, name: 'of Greed',  mods: { gold: [10, 25] } },
      { ilvl: 6, name: 'of Wealth', mods: { gold: [26, 60] } },
      { ilvl: 18, name: 'of Avarice', mods: { gold: [61, 100] } } ] },
    { id: 'regen', kind: 'suffix', slots: ['chest', 'amulet'], tiers: [
      { ilvl: 3, name: 'of Renewal', mods: { regen: [1, 1] } },
      { ilvl: 8, name: 'of Life',    mods: { regen: [2, 3] } },
      { ilvl: 18, name: 'of Vigor',       mods: { regen: [4, 6] } },
      { ilvl: 34, name: 'of Immortality', mods: { regen: [7, 10] } } ] }
  ],

  // Wandering merchant: shows up on the level you start on, then every 1-3 levels.
  merchant: {
    name: 'Corvin the Peddler',
    gap: [1, 3],
    talkRange: 1.6,
    stock: [
      { id: 'hp', name: 'Healing Potion', desc: 'Restores 45% of your life.', price: 50, minDepth: 1 },
      { id: 'mp', name: 'Mana Potion', desc: 'Restores 60% of your mana.', price: 50, minDepth: 1 }
    ]
  },

  // Difficulties. Normal uses the depth curve in 'scaling'. Nightmare and Hell start where the
  // previous difficulty ended (start) and grow more gently per level (curve).
  // requires: 'trial' = the Trial must be done, or the id of a difficulty that must be completed.
  difficulties: {
    normal:    { name: 'Normal',    finalDepth: 10, requires: null,        mlvl: 0,  ilvl: 0 },
    nightmare: { name: 'Nightmare', finalDepth: 14, requires: 'trial',     mlvl: 12, ilvl: 12,
                 start: { hp: 10, dmg: 5, xp: 4 },  curve: { hp: 0.12, dmg: 0.08, xp: 0.1 },
                 lockText: 'Complete the Trial to unlock.' },
    hell:      { name: 'Hell',      finalDepth: 18, requires: 'nightmare', mlvl: 26, ilvl: 26,
                 start: { hp: 28, dmg: 11, xp: 9 }, curve: { hp: 0.12, dmg: 0.08, xp: 0.1 },
                 lockText: 'Defeat The Ember Abbot on Nightmare to unlock.' }
  },

  // The Trial of Ash: a solo gauntlet unlocked by finishing Normal. Three sealed chambers,
  // each held by a mini boss, then the Hollow Judge. Falling sends you back to the menu
  // with nothing lost; the character is only saved when the Trial is won.
  trial: {
    name: 'The Trial of Ash',
    potions: { hp: 5, mp: 2 },
    chambers: [
      { depth: 8,  minions: 3, traits: 2 },
      { depth: 9,  minions: 3, traits: 2 },
      { depth: 10, minions: 4, traits: 2 }
    ],
    // Each chamber gets a different monster type, in random order.
    chamberTypes: ['gnawer', 'bonewalker', 'ashpriest'],
    gateHeal: 0.5,      // share of life and mana restored when a seal breaks
    miniHp: 1.0,
    judgeDepth: 12,
    judge: {
      scale: 1.9,
      judgement: { every: 5, cast: 0.6, count: 4, spread: 2.6, radius: 1.15, fuse: 1.3, dmg: [5, 8] },
      step: { every: 8, cast: 0.35 }
    },
    reward: { items: 2, rarity: 2, ilvl: 14, gold: [150, 250] }
  },

  // Appears from a dark portal when the Abbot falls on the last level of a difficulty.
  keeper: {
    name: 'The Veiled Keeper',
    lines: {
      normal: 'So the Abbot burns no more. Few have come this far, and fewer walk back up. The Trial has opened to you. It waits beyond my gate, and there your path will split, toward the light or into the dark. Go to the surface when you are ready.',
      nightmare: 'Again you stand in his ashes. Hell has opened its doors to you. It does not forgive what Nightmare forgave.',
      hell: 'There is nothing deeper than this. Not yet.',
      trial: 'You walked through the ash and came out whole. Nightmare lies open to you now. My altar has seen your trial; when it wakes, your path will split, toward the light or into the dark.'
    }
  },

  // Bosses guard the stairs. Mini bosses every 3-5 levels; the true boss waits on level 10.
  bosses: {
    gap: [3, 5],
    mini: {
      baseHp: 14, hpMul: 12, dmgMul: 1.9, xpMul: 12, scale: 1.6, minions: [3, 4], thirdTraitDepth: 7,
      names: {
        gnawer: ['Gravemaw', 'Rotfang', 'Old Gnash'],
        bonewalker: ['Bonecruncher', 'Sir Marrow', 'Rattlebane'],
        ashpriest: ['Deacon Soot', 'Cindermouth', 'The Pale Cantor']
      },
      // Bloodless: life steal does not work on it. Frenzied: faster below half life.
      traits: ['Swift', 'Stoneskin', 'Burning Aura', 'Vampiric', 'Bloodless', 'Frenzied']
    },
    // Optional boss in its own room on level 8 of every difficulty. Never seals the stairs.
    warden: {
      depth: 8, scale: 1.9,
      spikes: { every: 6, cast: 0.6, count: 5, step: 0.9, radius: 0.6, fuse: 0.9, stagger: 0.12, dmg: [4, 7] },
      raise: { at: [0.6, 0.3], count: 3 },
      reward: { items: 3, minRarity: 2, ilvlBonus: 4, unique: 0.25, gold: [15, 30] }
    },
    abbot: {
      scale: 2.0, escorts: [['bonewalker', 2]],
      volley: { every: 5, cast: 0.9, bolts: 5, spread: 0.3, dmg: [3, 5] },
      curse: { every: 10, cast: 0.7, range: 8, duration: 4, slow: 0.4 }
    }
  },

  rareA: ['Blood', 'Ash', 'Death', 'Shadow', 'Storm', 'Iron', 'Grim', 'Ghoul', 'Wolf', 'Night', 'Grave', 'Raven'],
  rareB: ['song', 'talon', 'spike', 'prayer', 'ward', 'bite', 'edge', 'brand', 'shroud', 'horn', 'eye', 'thorn'],

  // Equipment places. Rings use the item slot 'ring' and fit either ring place.
  slots: ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'ring2', 'amulet'],
  slotNames: { weapon: 'Weapon', helm: 'Helm', chest: 'Armor', gloves: 'Gloves', boots: 'Boots', ring: 'Left ring', ring2: 'Right ring', amulet: 'Amulet' },

  rules: {
    tick: 1 / 30,
    invSize: 32,
    maxPotions: 10,
    arrowSpeed: 15,
    playerRadius: 0.3,
    bowRange: 9,
    staffRange: 6.5, sparkSpeed: 11,
    respawnTime: 3,
    deathGoldLoss: 0.1,
    darkDuration: 3,    // seconds that dark damage takes to land
    leechCap: 20,       // total life steal from all items is capped at this percent
    reviveDelay: 5,     // seconds after death before a friend can resurrect you
    reviveChannel: 2,   // seconds the friend must stand still to resurrect
    reviveRange: 1.3,
    reviveLife: 0.5,    // share of life and mana you come back with
    reviveTimeout: 30   // if nobody comes, you return to the level start
  }
};

if (typeof module !== 'undefined') module.exports = DATA;
