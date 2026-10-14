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
    seer: { name: 'The Pale Seer', hp: 560, dmg: [9, 14], speed: 2.3, range: 7, atkTime: 0.6, atkCd: 1.4, xp: 1100, r: 0.42, ai: 'seer', aggro: 9,
                  abilities: ['Soul Lances', "Seer's Ward", 'Veil Step', 'Mirror Veil', 'Starfall', 'Blinding Veil'] },
    king: { name: 'The Hollowed King', hp: 430, dmg: [9, 14], speed: 2.0, range: 1.0, atkTime: 0.55, atkCd: 1.4, xp: 600, r: 0.45, ai: 'king', aggro: 8,
                  abilities: ['Blade Tempest', 'Kingsfall Charge', 'Shed the Mantle'] },
    ashpriest:  { name: 'Ash Priest', hp: 16, dmg: [4, 7], speed: 2.0, range: 7,    atkTime: 0.6,  atkCd: 2.3, xp: 20, r: 0.31, ai: 'caster', aggro: 9, boltSpeed: 7.5 },
    // Monsters that punish keeping your distance. Forest: hounds that leap at you, guards whose shields stop missiles.
    grave_hound: { name: 'Grave Hound', hp: 9, dmg: [2, 4], speed: 3.4, range: 0.55, atkTime: 0.3, atkCd: 1.0, xp: 8, r: 0.28, ai: 'hound', aggro: 9,
                   leap: { min: 3.2, max: 7, cd: 4, windup: 0.4, dur: 0.28, mult: 1.4 } },
    barrow_guard: { name: 'Barrow Guard', hp: 40, dmg: [4, 7], speed: 1.5, range: 0.75, atkTime: 0.5, atkCd: 1.6, xp: 22, r: 0.37, ai: 'melee', aggro: 7,
                   shield: { arc: 1.35 } },
    // Snow (for now in the caverns): a wraith that blinks to whoever stands farthest away and burns mana,
    // and a burrower that travels under the ground and bursts up beside you.
    frost_wraith: { name: 'Frost Wraith', hp: 18, dmg: [3, 6], speed: 2.4, range: 0.7, atkTime: 0.4, atkCd: 1.3, xp: 20, r: 0.3, ai: 'wraith', aggro: 10,
                   blink: { every: 5, minDist: 3.5, range: 12 }, manaBurn: 0.1, chill: 2 },
    rime_burrower: { name: 'Rime Burrower', hp: 22, dmg: [4, 7], speed: 2.0, range: 0.6, atkTime: 0.35, atkCd: 1.2, xp: 20, r: 0.3, ai: 'burrower', aggro: 9,
                   burrow: { at: 2.8, speed: 4.4, emerge: 1.1, radius: 1.6, mult: 1.3, chill: 1.5, surface: 3, windup: 0.5 } }
  },

  // Packs: which monsters spawn together, weight, minimum depth
  packs: [
    { w: 4, minDepth: 1, units: [['gnawer', 3, 5]] },
    { w: 4, minDepth: 1, units: [['bonewalker', 2, 3]] },
    { w: 2, minDepth: 1, units: [['ashpriest', 1, 1], ['bonewalker', 1, 2]] },
    { w: 2, minDepth: 2, units: [['ashpriest', 2, 2], ['gnawer', 2, 3]] },
    { w: 4, minDepth: 1, themes: ['forest'], units: [['grave_hound', 3, 5]] },
    { w: 3, minDepth: 1, themes: ['forest'], units: [['barrow_guard', 1, 2], ['grave_hound', 1, 2]] },
    { w: 2, minDepth: 2, themes: ['forest', 'crypt'], units: [['barrow_guard', 1, 1], ['ashpriest', 1, 1]] },
    { w: 3, minDepth: 1, themes: ['caves'], units: [['frost_wraith', 2, 3]] },
    { w: 3, minDepth: 1, themes: ['caves'], units: [['rime_burrower', 2, 3]] },
    { w: 2, minDepth: 1, themes: ['caves', 'monastery'], units: [['frost_wraith', 1, 1], ['rime_burrower', 1, 2], ['bonewalker', 1, 1]] }
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
      skill: 'nova', ward: 0.25, manaRegen: { pct: 0.015, perEne: 0.0002 }, start: { weapon: 'gnarled_staff', chest: 'leather_coat' }
    }
  },
  attrNames: { str: 'Strength', dex: 'Dexterity', vit: 'Vitality', ene: 'Energy' },
  skills: {
    multishot: { name: 'Multishot', mana: 5, arrows: 5, spread: 0.16, mult: 0.7, sameTarget: 0.35, desc: 'Five arrows in a fan. Each arrow after the first to hit the same enemy deals 35% damage.' },
    cleave:    { name: 'Cleave',    mana: 4, arc: 2.1, reach: 1.9, mult: 1.15, desc: 'Strike every enemy in an arc in front of you.' },
    nova:      { name: 'Nova', manaPct: 0.10, radius: 3, mult: 0.9, push: 1.3, desc: 'A ring of force around you that strikes every enemy within 3 tiles and throws them back. Costs 10% of your mana.' },
    // Nightstalker only: a patch of falling arrows at the cursor. Damage per half second = pct x your average hit.
    rain:      { name: 'Rain of Arrows', mana: 7, radius: 1.8, dur: 3, tick: 0.5, pct: 0.45, cooldown: 1.5, desc: 'Arrows rain on an area you can see, dealing dark damage over 3 seconds. 1.5 second cooldown.' }
  },

  // Ascendancy: a path chosen at the altar after the Trial of Ash. The path changes your main
  // attack and your skill (its core); tree points (one per two levels) buy ranks in its nodes.
  // Node text: {v} is replaced by rank x per (the node's current total).
  ascendancy: {
    firstLevel: 10,   // one point per level from level 10 (level 14 = 5 points), once the Trial is passed
    treeVersion: 3,   // bump when ranks change: saved trees are refunded
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
        desc: '+2 light radius. Your arrows pierce one enemy, losing 50% damage per pierce. Hold Multishot to draw it: the longer you draw, the harder it hits, and at full draw (2 seconds) every arrow deals more than six times its damage and pierces 2 more enemies.',
        light: 2, pierce: 1, pierceKeep: 0.5, charge: { min: 0, full: 2, dmg: 5.4, pierce: 2 } },
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
      lore: 'Gathers the dark to her and holds it where her allies can reach it. Nova draws enemies in and shields the ones who stand with her.',
      core: { name: 'Radiant Ward',
        desc: 'Nova draws enemies in toward you and stuns them for 0.6 seconds, and shields you and every ally within its ring for 12% of your life for 4 seconds. A shield can only be renewed every 6 seconds. Radiant Spark: each Spark strikes the same enemy again a moment later for 40% of the hit.',
        pull: true, stun: 0.6, shield: { pct: 0.12, dur: 4, cooldown: 6 }, echo: { delay: 0.3, pct: 0.4 } },
      nodes: [
        { id: 'radiant_shield', name: 'Radiant Shield', max: 7, per: 10, desc: 'Nova shields absorb +{v}% more.' },
        { id: 'wide_nova', name: 'Wide Nova', max: 7, per: 5, desc: 'Nova reaches +{v}% further.' },
        { id: 'clear_mind', name: 'Clear Mind', max: 5, per: 1, desc: 'Nova costs {v}% less of your mana.' },
        { id: 'dazzle', name: 'Dazzle', max: 6, per: 0.3, desc: 'Enemies struck by Nova lose track of you for {v}s. Bosses are not fooled.' },
        { id: 'blink', name: 'Blink', max: 1, per: 1, req: 4, desc: 'Nova first carries you to the cursor (up to 6 tiles, where you can see), then bursts there.', range: 6 },
        { id: 'sanctuary', name: 'Sanctuary', max: 1, per: 1, req: 8, desc: 'Nova leaves holy ground for 3 seconds. Allies on it heal 3% of their life each second.', dur: 3, radius: 2, pct: 0.03 },
        { id: 'sunfall', name: 'Sunfall', max: 1, per: 1, req: 16, desc: 'Every second Nova brings down the light on the enemies it draws in for 200% of your hit.', mult: 2 }
      ]
    },
    voidcaller: {
      name: 'Voidcaller', cls: 'mage', side: 'dark', skill: 'nova',
      lore: 'Casts the world away and lets it rot at a distance. What dies in the Decay passes it on.',
      core: { name: 'Decay',
        desc: 'Nova throws enemies back and afflicts them with Decay: 60% of your hit as dark damage over 4 seconds. Enemies in Decay deal 15% less damage. When an enemy dies in Decay, it passes to an enemy nearby. Void Spark: each Spark leaves a stack of rot dealing 45% of the hit as dark damage over 3 seconds, up to 5 stacks on one enemy.',
        decay: { pct: 0.6, dur: 4, spread: 4.5, weaken: 0.15 }, voidSpark: { pct: 0.45, dur: 3, max: 5 } },
      nodes: [
        { id: 'virulence', name: 'Virulence', max: 7, per: 8, desc: 'Decay deals +{v}% damage.' },
        { id: 'lingering', name: 'Lingering Rot', max: 6, per: 0.5, desc: 'Decay lasts {v}s longer.' },
        { id: 'repulsion', name: 'Repulsion', max: 7, per: 10, desc: 'Nova throws enemies +{v}% further.' },
        { id: 'withering', name: 'Withering', max: 6, per: 5, desc: 'Enemies in Decay are slowed by {v}%.' },
        { id: 'rot_wave', name: 'Rot Wave', max: 1, per: 1, req: 4, desc: 'Decay deals 30% more damage to enemies more than 3 tiles away from you.', pct: 0.3, dist: 3 },
        { id: 'contagion', name: 'Contagion', max: 1, per: 1, req: 8, desc: 'Decay passes on to two enemies at full strength when its host dies.' },
        { id: 'crushing_dark', name: 'Crushing Dark', max: 1, per: 1, req: 16, desc: 'Enemies that Nova throws into a wall are crushed for 150% of your hit.', mult: 1.5 }
      ]
    }
  },

  // Unique items (rarity 3). mods: [min, max] or a fixed number. Special keys are read by the engine:
  // pierce, multiArrows, rainDur, stealth (% later noticed), dodge, block, dr (% less damage), zealDur,
  // ripPct, chainPct, cleaveArea, rendMax, darkFast (dark lands in 2s), darkKillMana, hitHeal (% life per hit),
  // noSlow, and node_<id> (+ranks to that tree node, above its max).
  // Loot: rare chance = rareBase + rarePerIlvl * ilvl (capped). Affix tiers: only the four highest the item level
  // allows can roll; weights from the top down are tierWeights; endgame tiers (item level 55 / 70) get their own small weights.
  loot: { rareBase: 0.04, rarePerIlvl: 0.0015, rareCap: 0.14, rareAffixes: [[3, 50], [4, 35], [5, 15]],
          tierWindow: 4, tierWeights: [1, 3, 6, 8], endgame: [[70, 0.08], [55, 0.3]] },
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
      fx: ['Each hit heals 1% of your life'] },
    // Mage: three for the Lightbinder, three for the Voidcaller, two for either.
    { id: 'starfall_rod', name: 'Starfall Rod', base: 'battle_staff', cls: 'mage', mods: { dmgPct: [60, 80], lightMin: [4, 6], lightMax: [8, 12], ene: 8, sparkSpeed: 30, prism: 1 },
      fx: ['Spark flies 30% faster', 'Spark splits into two more sparks when it hits, each dealing 50%'] },
    { id: 'blinkstep', name: 'Blinkstep Sandals', base: 'boots', cls: 'mage', mods: { run: [15, 20], mana: 15, blinkRange: 2, node_blink: 1 },
      fx: ['Blink reaches 2 tiles further', '+1 to Blink (Lightbinder)'] },
    { id: 'bright_ward', name: 'Band of the Bright Ward', base: 'ring', cls: 'mage', mods: { lightMin: [2, 4], lightMax: [5, 8], mana: 15, novaShield: 20, node_radiant_shield: 1 },
      fx: ['Nova shields absorb 20% more', '+1 to Radiant Shield (Lightbinder)'] },
    { id: 'voidwoven', name: 'Voidwoven Shroud', base: 'leather_coat', cls: 'mage', mods: { armorPct: [40, 60], life: [20, 30], darkMin: [3, 5], darkMax: [6, 9], node_contagion: 1 },
      fx: ['+1 to Contagion (Voidcaller)'] },
    { id: 'grasp_of_the_void', name: 'Grasp of the Void', base: 'gloves', cls: 'mage', mods: { ias: 15, ene: [5, 8], decayDur: 1, node_repulsion: 1 },
      fx: ['Decay lasts 1s longer (Voidcaller)', '+1 to Repulsion (Voidcaller)'] },
    { id: 'eye_of_the_abyss', name: 'Eye of the Abyss', base: 'amulet', cls: 'mage', mods: { ene: [10, 15], darkMin: [5, 8], darkMax: [9, 14], decayKillMana: 2 },
      fx: ['Enemies killed by Decay restore 2% of your mana'] },
    { id: 'quiet_mind', name: 'Circlet of the Quiet Mind', base: 'hood', cls: 'mage', mods: { ene: [10, 15], mana: [20, 30], ward: 10 },
      fx: ['Ward takes 35% of damage from your mana instead of 25%'] },
    { id: 'hollow_echoes', name: 'Ring of Hollow Echoes', base: 'ring', cls: 'mage', mods: { mana: 20, life: [10, 15], echoEvery: 5 },
      fx: ['Every 5th Spark deals 50% more damage and restores 3 mana'] },
    // Boss weapons: never rolled at random, only dropped by their boss (drop: boss kind, diffs: difficulties).
    // These are the Normal versions, made for a character around level 11.
    { id: 'marrowcleaver', name: 'Marrowcleaver', base: 'war_axe', cls: 'warrior', drop: 'warden', diffs: ['normal'],
      mods: { dmgPct: [70, 90], str: [6, 10], life: [15, 25], boneWard: 4 },
      fx: ['Kills grant Bone Ward: you take 4% less damage per stack, up to 5 stacks, for 6s'] },
    { id: 'ossuary_string', name: 'Ossuary String', base: 'composite_bow', cls: 'archer', drop: 'warden', diffs: ['normal'],
      mods: { dmgPct: [60, 80], dex: [6, 10], pierce: 1, boneShards: 3 },
      fx: ['Arrows pierce 1 more enemy', 'Arrows that kill burst into 3 bone shards dealing 50% damage'] },
    { id: 'gravewardens_crook', name: "Gravewarden's Crook", base: 'bone_staff', cls: 'mage', drop: 'warden', diffs: ['normal'],
      mods: { dmgPct: [60, 80], ene: [8, 12], mana: [15, 25], killMana: 3, novaCost: 2 },
      fx: ['Each kill restores 3% of your mana', 'Nova costs 2% less of your mana'] },
    // The Hollowed King's weapons (Nightmare), made for a character around level 27.
    // dmg overrides the base's damage so the weapon matches that level.
    { id: 'kingsfall', name: 'Kingsfall', base: 'bastard_sword', dmg: [17, 35], cls: 'warrior', drop: 'king', diffs: ['nightmare'],
      mods: { dmgPct: [80, 100], str: [10, 15], life: [25, 40], cleaveBlades: 3 },
      fx: ['Cleave hurls 3 rusted blades forward, each dealing 40% of your hit'] },
    { id: 'mantlethorn', name: 'Mantlethorn', base: 'ashwood_bow', dmg: [16, 35], cls: 'archer', drop: 'king', diffs: ['nightmare'],
      mods: { dmgPct: [70, 90], dex: [10, 15], ias: 10, mantleEvery: 4 },
      fx: ['Every 4th arrow is a spinning mantle blade that passes through every enemy'] },
    { id: 'hollow_court', name: 'Scepter of the Hollow Court', base: 'grave_staff', dmg: [15, 33], cls: 'mage', drop: 'king', diffs: ['nightmare'],
      mods: { dmgPct: [70, 90], ene: [12, 18], darkMin: [6, 9], darkMax: [11, 16], novaBlades: 8 },
      fx: ['Nova hurls 8 rusted blades outward, each dealing 35% of your hit'] },
    // The Gravewarden on Nightmare (for a character around level 24) and Hell (around level 38).
    { id: 'ossuary_reaver', name: 'Ossuary Reaver', base: 'battle_axe', dmg: [16, 34], cls: 'warrior', drop: 'warden', diffs: ['nightmare'],
      mods: { dmgPct: [80, 100], str: [12, 18], life: [35, 50], boneWard: 5 },
      fx: ['Kills grant Bone Ward: you take 5% less damage per stack, up to 5 stacks, for 6s'] },
    { id: 'marrowstring', name: 'Marrowstring', base: 'ashwood_bow', dmg: [15, 33], cls: 'archer', drop: 'warden', diffs: ['nightmare'],
      mods: { dmgPct: [70, 90], dex: [12, 18], pierce: 1, boneShards: 5 },
      fx: ['Arrows pierce 1 more enemy', 'Arrows that kill burst into 5 bone shards dealing 50% damage'] },
    { id: 'ossuary_crook', name: 'Crook of the Ossuary', base: 'grave_staff', dmg: [14, 31], cls: 'mage', drop: 'warden', diffs: ['nightmare'],
      mods: { dmgPct: [70, 90], ene: [15, 22], mana: [30, 45], killMana: 4, novaCost: 3 },
      fx: ['Each kill restores 4% of your mana', 'Nova costs 3% less of your mana'] },
    { id: 'gravelords_cleaver', name: "Gravelord's Cleaver", base: 'battle_axe', dmg: [26, 52], cls: 'warrior', drop: 'warden', diffs: ['hell'],
      mods: { dmgPct: [100, 130], str: [18, 25], life: [50, 70], boneWard: 6 },
      fx: ['Kills grant Bone Ward: you take 6% less damage per stack, up to 5 stacks, for 6s'] },
    { id: 'bonechoir', name: 'Bonechoir', base: 'grave_bow', dmg: [22, 48], cls: 'archer', drop: 'warden', diffs: ['hell'],
      mods: { dmgPct: [90, 120], dex: [18, 25], pierce: 2, boneShards: 5 },
      fx: ['Arrows pierce 2 more enemies', 'Arrows that kill burst into 5 bone shards dealing 50% damage'] },
    { id: 'last_rite', name: "Warden's Last Rite", base: 'obsidian_staff', dmg: [21, 46], cls: 'mage', drop: 'warden', diffs: ['hell'],
      mods: { dmgPct: [90, 120], ene: [22, 30], mana: [45, 60], killMana: 5, novaCost: 3 },
      fx: ['Each kill restores 5% of your mana', 'Nova costs 3% less of your mana'] },
    // The Hollowed King on Hell (for a character around level 41).
    { id: 'crownbreaker', name: 'Crownbreaker', base: 'executioner_sword', dmg: [29, 58], cls: 'warrior', drop: 'king', diffs: ['hell'],
      mods: { dmgPct: [110, 140], str: [20, 28], life: [55, 75], cleaveBlades: 5 },
      fx: ['Cleave hurls 5 rusted blades forward, each dealing 40% of your hit'] },
    { id: 'regicide', name: 'Regicide', base: 'ember_longbow', dmg: [25, 54], cls: 'archer', drop: 'king', diffs: ['hell'],
      mods: { dmgPct: [100, 130], dex: [20, 28], ias: 15, mantleEvery: 3 },
      fx: ['Every 3rd arrow is a spinning mantle blade that passes through every enemy'] },
    { id: 'fallen_throne', name: 'Scepter of the Fallen Throne', base: 'ember_staff', dmg: [24, 51], cls: 'mage', drop: 'king', diffs: ['hell'],
      mods: { dmgPct: [100, 130], ene: [22, 30], darkMin: [12, 16], darkMax: [20, 28], novaBlades: 12 },
      fx: ['Nova hurls 12 rusted blades outward, each dealing 35% of your hit'] },
    // The Pale Seer (Hell, for a character around level 45).
    { id: 'veilsplitter', name: 'Veilsplitter', base: 'executioner_sword', dmg: [33, 66], cls: 'warrior', drop: 'seer', diffs: ['hell'],
      mods: { dmgPct: [120, 150], str: [22, 30], life: [60, 80], tearVeil: 15 },
      fx: ['Enemies you hit take 15% more damage from everyone for 3s'] },
    { id: 'seers_gaze', name: "Seer's Gaze", base: 'ember_longbow', dmg: [28, 60], cls: 'archer', drop: 'seer', diffs: ['hell'],
      mods: { dmgPct: [110, 140], dex: [22, 30], pierce: 1, homing: 1 },
      fx: ['Arrows pierce 1 more enemy', 'Arrows bend toward enemies in their path'] },
    { id: 'blind_crystal', name: 'Crystal of the Blind', base: 'ember_staff', dmg: [27, 57], cls: 'mage', drop: 'seer', diffs: ['hell'],
      mods: { dmgPct: [110, 140], ene: [24, 32], lightMin: [14, 18], lightMax: [26, 34], novaLances: 6 },
      fx: ['Nova releases 6 soul lances that seek out enemies, each dealing 40% of your hit'] }
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
    // Endgame bases (rifts): item level 55 and 70.
    { id: 'wraith_bow',    name: 'Wraith Bow',    slot: 'weapon', wclass: 'bow',   ilvl: 55, dmg: [30, 64], aps: 1.45 },
    { id: 'ashen_greatbow', name: 'Ashen Greatbow', slot: 'weapon', wclass: 'bow', ilvl: 70, dmg: [37, 79], aps: 1.45 },
    { id: 'reaver_axe',    name: 'Reaver Axe',    slot: 'weapon', wclass: 'melee', ilvl: 55, dmg: [35, 70], aps: 1.2 },
    { id: 'doomblade',     name: 'Doomblade',     slot: 'weapon', wclass: 'melee', ilvl: 70, dmg: [44, 86], aps: 1.25 },
    { id: 'wraith_staff',  name: 'Wraith Staff',  slot: 'weapon', wclass: 'staff', ilvl: 55, dmg: [29, 61], aps: 1.35 },
    { id: 'abyssal_staff', name: 'Abyssal Staff', slot: 'weapon', wclass: 'staff', ilvl: 70, dmg: [36, 75], aps: 1.35 },
    { id: 'wraith_helm',   name: 'Wraith Helm',   slot: 'helm',   ilvl: 55, armor: [46, 60] },
    { id: 'doom_helm',     name: 'Doom Helm',     slot: 'helm',   ilvl: 70, armor: [60, 78] },
    { id: 'wraith_plate',  name: 'Wraith Plate',  slot: 'chest',  ilvl: 55, armor: [80, 102] },
    { id: 'doom_plate',    name: 'Doom Plate',    slot: 'chest',  ilvl: 70, armor: [104, 132] },
    { id: 'wraith_grips',  name: 'Wraith Grips',  slot: 'gloves', ilvl: 55, armor: [22, 29] },
    { id: 'doom_gauntlets', name: 'Doom Gauntlets', slot: 'gloves', ilvl: 70, armor: [29, 38] },
    { id: 'wraith_treads', name: 'Wraith Treads', slot: 'boots',  ilvl: 55, armor: [22, 29] },
    { id: 'doom_greaves',  name: 'Doom Greaves',  slot: 'boots',  ilvl: 70, armor: [29, 38] },
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
      { ilvl: 42, name: 'Cataclysmic', mods: { dmgPct: [141, 190] } },
      { ilvl: 55, name: 'Apocalyptic', mods: { dmgPct: [191, 240] } }, { ilvl: 70, name: 'Worldending', mods: { dmgPct: [241, 300] } } ] },
    // Light: added to every hit at once. Set a little under the old fire values; light paths get +20% on top.
    { id: 'light', kind: 'prefix', slots: ['weapon', 'ring', 'gloves'], tiers: [
      { ilvl: 1,  name: 'Gleaming',  mods: { lightMin: [1, 2], lightMax: [3, 4] } },
      { ilvl: 5,  name: 'Radiant',   mods: { lightMin: [3, 4], lightMax: [6, 9] } },
      { ilvl: 10, name: 'Hallowed',  mods: { lightMin: [5, 8], lightMax: [11, 17] } },
      { ilvl: 18, name: 'Dawnlit',   mods: { lightMin: [9, 12], lightMax: [18, 26] } },
      { ilvl: 30, name: 'Sunforged', mods: { lightMin: [13, 19], lightMax: [26, 38] } },
      { ilvl: 42, name: 'Seraphic',  mods: { lightMin: [20, 27], lightMax: [39, 55] } },
      { ilvl: 55, name: 'Empyrean', mods: { lightMin: [28, 35], lightMax: [56, 72] } }, { ilvl: 70, name: 'Godlit', mods: { lightMin: [36, 45], lightMax: [73, 92] } } ] },
    // Dark: dealt over rules.darkDuration seconds after the hit. More in total than light, but slower; dark paths get +20%.
    { id: 'dark', kind: 'prefix', slots: ['weapon', 'ring', 'gloves'], tiers: [
      { ilvl: 1,  name: 'Shadowed',    mods: { darkMin: [1, 3], darkMax: [4, 6] } },
      { ilvl: 5,  name: 'Umbral',      mods: { darkMin: [4, 6], darkMax: [8, 13] } },
      { ilvl: 10, name: 'Gloomforged', mods: { darkMin: [7, 10], darkMax: [15, 23] } },
      { ilvl: 18, name: 'Nightborn',   mods: { darkMin: [12, 16], darkMax: [24, 35] } },
      { ilvl: 30, name: 'Abyssal',     mods: { darkMin: [17, 25], darkMax: [36, 52] } },
      { ilvl: 42, name: 'Voidtouched', mods: { darkMin: [26, 37], darkMax: [53, 75] } },
      { ilvl: 55, name: 'Eclipsed', mods: { darkMin: [38, 48], darkMax: [76, 98] } }, { ilvl: 70, name: 'Oblivion', mods: { darkMin: [49, 61], darkMax: [99, 125] } } ] },
    { id: 'armor', kind: 'prefix', slots: ['helm', 'chest', 'gloves', 'boots'], tiers: [
      { ilvl: 1,  name: 'Sturdy',     mods: { armorPct: [10, 20] } },
      { ilvl: 5,  name: 'Strong',     mods: { armorPct: [21, 40] } },
      { ilvl: 10, name: 'Unyielding', mods: { armorPct: [41, 70] } },
      { ilvl: 18, name: 'Bastion',    mods: { armorPct: [71, 100] } },
      { ilvl: 30, name: 'Adamant',    mods: { armorPct: [101, 140] } },
      { ilvl: 42, name: 'Godforged',  mods: { armorPct: [141, 180] } },
      { ilvl: 55, name: 'Titanforged', mods: { armorPct: [181, 230] } }, { ilvl: 70, name: 'Unbreakable', mods: { armorPct: [231, 290] } } ] },
    { id: 'leech', kind: 'prefix', slots: ['weapon', 'ring'], tiers: [
      { ilvl: 3, name: 'Bloody',   mods: { leech: [2, 4] } },
      { ilvl: 9, name: 'Vampiric', mods: { leech: [5, 8] } },
      { ilvl: 20, name: 'Bloodthirsty',   mods: { leech: [9, 12] } },
      { ilvl: 36, name: 'Exsanguinating', mods: { leech: [13, 16] } },
      { ilvl: 55, name: 'Vampiric', mods: { leech: [17, 20] } } ] },

    { id: 'life', kind: 'suffix', slots: ['helm', 'chest', 'boots', 'ring', 'amulet', 'gloves'], tiers: [
      { ilvl: 1, name: 'of the Wolf',  mods: { life: [5, 10] } },
      { ilvl: 4, name: 'of the Bear',  mods: { life: [11, 20] } },
      { ilvl: 9, name: 'of the Giant', mods: { life: [21, 35] } },
      { ilvl: 16, name: 'of the Colossus',  mods: { life: [36, 55] } },
      { ilvl: 28, name: 'of the Leviathan', mods: { life: [56, 80] } },
      { ilvl: 40, name: 'of the Undying',   mods: { life: [81, 110] } },
      { ilvl: 55, name: 'of the Colossus', mods: { life: [111, 145] } }, { ilvl: 70, name: 'of Eternity', mods: { life: [146, 190] } } ] },
    { id: 'mana', kind: 'suffix', slots: ['helm', 'ring', 'amulet', 'gloves'], tiers: [
      { ilvl: 1, name: 'of the Owl', mods: { mana: [5, 10] } },
      { ilvl: 6, name: 'of Wisdom',  mods: { mana: [11, 20] } },
      { ilvl: 16, name: 'of the Sage',     mods: { mana: [21, 35] } },
      { ilvl: 30, name: 'of the Archmage', mods: { mana: [36, 55] } },
      { ilvl: 55, name: 'of the Archon', mods: { mana: [56, 80] } }, { ilvl: 70, name: 'of Infinity', mods: { mana: [81, 110] } } ] },
    { id: 'dex', kind: 'suffix', slots: ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet'], tiers: [
      { ilvl: 1,  name: 'of the Stag',   mods: { dex: [2, 5] } },
      { ilvl: 5,  name: 'of the Falcon', mods: { dex: [6, 10] } },
      { ilvl: 10, name: 'of the Eagle',  mods: { dex: [11, 16] } },
      { ilvl: 18, name: 'of the Hawk',  mods: { dex: [17, 22] } },
      { ilvl: 32, name: 'of Precision', mods: { dex: [23, 30] } },
      { ilvl: 55, name: 'of the Phantom', mods: { dex: [31, 40] } }, { ilvl: 70, name: 'of the Wind God', mods: { dex: [41, 52] } } ] },
    { id: 'str', kind: 'suffix', slots: ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet'], tiers: [
      { ilvl: 1,  name: 'of the Ox',    mods: { str: [2, 5] } },
      { ilvl: 5,  name: 'of the Bull',  mods: { str: [6, 10] } },
      { ilvl: 10, name: 'of the Titan', mods: { str: [11, 16] } },
      { ilvl: 18, name: 'of Might',        mods: { str: [17, 22] } },
      { ilvl: 32, name: 'of the Behemoth', mods: { str: [23, 30] } },
      { ilvl: 55, name: 'of the Titan', mods: { str: [31, 40] } }, { ilvl: 70, name: 'of the Mountain', mods: { str: [41, 52] } } ] },
    { id: 'vit', kind: 'suffix', slots: ['helm', 'chest', 'boots', 'ring', 'amulet'], tiers: [
      { ilvl: 1, name: 'of the Oak',      mods: { vit: [2, 5] } },
      { ilvl: 6, name: 'of the Mountain', mods: { vit: [6, 12] } },
      { ilvl: 16, name: 'of the Ancients', mods: { vit: [13, 20] } },
      { ilvl: 30, name: 'of the Earth',    mods: { vit: [21, 30] } },
      { ilvl: 55, name: 'of the Oak', mods: { vit: [31, 42] } }, { ilvl: 70, name: 'of the World Tree', mods: { vit: [43, 56] } } ] },
    { id: 'ene', kind: 'suffix', slots: ['helm', 'ring', 'amulet'], tiers: [
      { ilvl: 1, name: 'of the Moon',  mods: { ene: [2, 5] } },
      { ilvl: 6, name: 'of the Stars', mods: { ene: [6, 12] } },
      { ilvl: 16, name: 'of the Void',   mods: { ene: [13, 20] } },
      { ilvl: 30, name: 'of the Cosmos', mods: { ene: [21, 30] } },
      { ilvl: 55, name: 'of the Stars', mods: { ene: [31, 42] } }, { ilvl: 70, name: 'of the Aether', mods: { ene: [43, 56] } } ] },
    { id: 'ias', kind: 'suffix', slots: ['weapon', 'gloves'], tiers: [
      { ilvl: 2, name: 'of Swiftness', mods: { ias: [5, 10] } },
      { ilvl: 8, name: 'of Haste',     mods: { ias: [11, 20] } },
      { ilvl: 18, name: 'of Fury',   mods: { ias: [21, 30] } },
      { ilvl: 34, name: 'of Frenzy', mods: { ias: [31, 40] } },
      { ilvl: 55, name: 'of Bloodrage', mods: { ias: [41, 48] } }, { ilvl: 70, name: 'of the Whirlwind', mods: { ias: [49, 56] } } ] },
    { id: 'run', kind: 'suffix', slots: ['boots'], tiers: [
      { ilvl: 1, name: 'of the Wind',  mods: { run: [10, 15] } },
      { ilvl: 6, name: 'of the Storm', mods: { run: [16, 25] } },
      { ilvl: 20, name: 'of the Tempest', mods: { run: [26, 35] } },
      { ilvl: 55, name: 'of the Gale', mods: { run: [36, 40] } } ] },
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
      { ilvl: 34, name: 'of Immortality', mods: { regen: [7, 10] } },
      { ilvl: 55, name: 'of Renewal', mods: { regen: [11, 15] } }, { ilvl: 70, name: 'of the Phoenix', mods: { regen: [16, 21] } } ] }
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
    // Each new difficulty opens a step above where the last one ended (about +25% life, +15% damage),
    // then climbs a little more gently so its last levels stay where they were tuned.
    nightmare: { name: 'Nightmare', finalDepth: 14, requires: 'trial',     mlvl: 12, ilvl: 12,
                 start: { hp: 12.5, dmg: 6, xp: 6.2 },  curve: { hp: 0.0806, dmg: 0.0539, xp: 0.0372 },
                 lockText: 'Complete the Trial to unlock.' },
    hell:      { name: 'Hell',      finalDepth: 18, requires: 'nightmare', mlvl: 26, ilvl: 26,
                 start: { hp: 32, dmg: 11.75, xp: 10.5 }, curve: { hp: 0.0976, dmg: 0.0711, xp: 0.0782 },
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
      // unique: chance of a unique; where the boss has its own weapons for this difficulty, it is one of those.
      reward: { items: 3, minRarity: 2, ilvlBonus: 4, unique: 0.25, gold: [15, 30] }
    },
    // Optional boss on Nightmare and Hell, in a throne room on a random level from 10 to 12 (fixed per game).
    // Blade Tempest: spins, cuts everything close and throws a ring of rusted blades.
    // Kingsfall Charge: winds up, then runs a straight line through the player.
    // Shed the Mantle: at half life throws off his cloak in a storm of blades and fights faster from then on.
    king: {
      depths: [10, 12], difficulties: ['nightmare', 'hell'], scale: 1.9,
      // Hits hard on purpose: every big attack is shown on the ground first and can be walked out of.
      tempest: { every: 7, cast: 1.0, near: 4.5, radius: 2.4, mult: 2.0, blades: 8, bladeSpeed: 7.5, bladeLife: 0.9, bladeDmg: [6, 10] },
      charge: { every: 6, windup: 0.7, min: 3, max: 9, speed: 13, mult: 2.6, width: 0.55, recover: 0.8 },
      shed: { at: 0.5, cast: 1.2, dr: 0.8, blades: 16, speed: 1.3, cd: 0.75, chargeEvery: 4.5, tempestEvery: 5.5 },
      reward: { items: 4, minRarity: 2, ilvlBonus: 5, unique: 0.3, gold: [20, 40] }
    },
    // Optional Hell boss on level 14-16: a ranged caster in a chamber with pillars. She keeps her distance and
    // teleports on a timer; far from her the world goes dark and the cold sets in, so the fight is fought up close.
    seer: {
      depths: [14, 16], difficulties: ['hell'], scale: 1.8,
      keep: [3.5, 6.5],                                                      // the distance she likes to keep
      lance: { every: 2.4, cast: 0.6, count: 5, late: 2, spread: 0.26, speed: 7.5, life: 2.4, turn: 0.9, dmg: [2, 3] },   // late: extra lances below half health
      ward: { every: 8, cast: 0.7, radius: 1.5, dur: 6, manaDrain: 0.04, chill: 0.6 },
      veil: { every: 9, cast: 0.8, minJump: 5 },
      mirror: { at: [0.66, 0.33], copies: 2, hp: 0.06, dmg: 0.4, life: 15 },
      star: { at: 0.25, every: 12, cast: 3, interval: 0.22, fuse: 1.0, radius: 1.1, dmg: [7, 11] },
      dark: { near: 3, far: 6, minLight: 2, chillMin: 0.005, chillMax: 0.02, ramp: 3 },
      reward: { items: 6, minRarity: 2, ilvlBonus: 6, unique: 0.4, gold: [40, 80] }
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
