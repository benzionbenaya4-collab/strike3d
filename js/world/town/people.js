// אנשי העיר: תפקידים, שמות (בדיוניים), רמזים וטקסטים למחברת.
export const NAMES = {
  m: ['אורי', 'דני', 'יוסי', 'משה', 'רון', 'איתי', 'עמית', 'גיל', 'בני', 'שי', 'ניר', 'אבי', 'עידו', 'תומר'],
  f: ['נועה', 'מיכל', 'רינה', 'תמר', 'שירה', 'יעל', 'דנה', 'אורית', 'הילה', 'ליאת', 'מאיה', 'רותם', 'עדי', 'גלי'],
};

// role: he = שם תפקיד (זכר/נקבה), work = סוג מקום עבודה, look = שדות קבועים למראה, speed = מהירות הליכה, herring = רמז "תמים"
export const ROLES = [
  { id: 'baker',   he: ['אופה', 'אופה'], work: 'stall', slot: 0, look: { apron: true, hat: 'chef', age: 'adult' } },
  { id: 'grocer',  he: ['ירקן', 'ירקנית'], work: 'stall', slot: 1, look: { apron: true, age: 'adult' } },
  { id: 'florist', he: ['מוכר פרחים', 'מוכרת פרחים'], work: 'stall', slot: 2, look: { age: 'adult' } },
  { id: 'falafel', he: ['מוכר פלאפל', 'מוכרת פלאפל'], work: 'stall', slot: 3, look: { apron: true, age: 'adult' } },
  { id: 'cop',     he: ['שוטר', 'שוטרת'], work: 'patrol', look: { hat: 'police', shirt: '#2b3a67', pants: '#1b2238', badge: true, dress: false, age: 'adult' } },
  { id: 'mail',    he: ['דוור', 'דוורית'], work: 'patrol', look: { hat: 'cap', hatColor: '#1e3799', shirt: '#4a69bd', backpack: true, age: 'adult', dress: false }, herring: 'animals' },
  { id: 'barista', he: ['בריסטה', 'בריסטה'], work: 'cafe', look: { apron: true, age: 'adult' } },
  { id: 'gardener',he: ['גנן', 'גננת'], work: 'park', look: { hat: 'cap', hatColor: '#27ae60', shirt: '#6ab04c', gloves: '#3d5a2a', age: 'adult', dress: false } },
  { id: 'grandpa', he: ['סבא', 'סבתא'], work: 'bench', look: { age: 'old', cane: true }, speed: 0.9, herring: 'limp' },
  { id: 'stars',   he: ['חובב כוכבים', 'חובבת כוכבים'], work: 'square', look: { glasses: true, age: 'adult' }, herring: 'sky' },
  { id: 'dancer',  he: ['רקדן רחוב', 'רקדנית רחוב'], work: 'square', look: { hat: 'beanie', age: 'adult' }, herring: 'twitch' },
  { id: 'kid',     he: ['ילד', 'ילדה'], work: 'park', look: { age: 'kid' }, speed: 2.2 },
  { id: 'kid2',    he: ['ילד', 'ילדה'], work: 'square', look: { age: 'kid' }, speed: 2.2 },
  { id: 'jogger',  he: ['רץ', 'רצה'], work: 'jog', look: { sleeves: 'short', age: 'adult' }, speed: 3.2 },
  { id: 'student', he: ['סטודנט', 'סטודנטית'], work: 'cafe', look: { backpack: true, age: 'adult' } },
  { id: 'tourist', he: ['תייר', 'תיירת'], work: 'stroll', look: { hat: 'fedora', age: 'adult' } },
  { id: 'teacher', he: ['מורה', 'מורה'], work: 'square', look: { glasses: true, age: 'adult' } },
  { id: 'painter', he: ['צייר', 'ציירת'], work: 'park', look: { hat: 'beanie', age: 'adult' } },
  { id: 'doctor',  he: ['רופא', 'רופאה'], work: 'stroll', look: { shirt: '#f5f6fa', jacket: '#f5f6fa', age: 'adult' } },
  { id: 'cook',    he: ['טבח', 'טבחית'], work: 'cafe', look: { apron: true, hat: 'chef', age: 'adult' } },
  { id: 'neighbor',he: ['שכן', 'שכנה'], work: 'home', look: { age: 'old' }, speed: 1.1 },
  { id: 'musician',he: ['נגן', 'נגנית'], work: 'lamp', look: { hat: 'fedora', age: 'adult' } },
  { id: 'banker',  he: ['פקיד בנק', 'פקידת בנק'], work: 'stroll', look: { jacket: '#2d3436', age: 'adult' } },
  { id: 'cyclist', he: ['שליח', 'שליחה'], work: 'jog', look: { hat: 'cap', hatColor: '#e67e22', backpack: true, age: 'adult' }, speed: 2.6 },
  { id: 'nurse',   he: ['אח', 'אחות'], work: 'stroll', look: { shirt: '#74b9ff', pants: '#74b9ff', age: 'adult', dress: false } },
  { id: 'student2',he: ['תלמיד', 'תלמידה'], work: 'square', look: { backpack: true, age: 'kid' }, speed: 1.8 },
];

// רמזים של המתחזה (8). text = מה נרשם במחברת.
export const TELLS = {
  limp:    { icon: '🦵', text: 'צליעה מוזרה בהליכה' },
  twitch:  { icon: '⚡', text: 'התעוותות פתאומית' },
  owl:     { icon: '🦉', text: 'הראש הסתובב 180° וחזר!' },
  eat:     { icon: '🍽️', text: 'אכל משהו מוזר' },
  noblink: { icon: '👁️', text: 'לא ממצמץ בכלל' },
  sky:     { icon: '🌌', text: 'בוהה בשמיים בלי לזוז' },
  animals: { icon: '🐕', text: 'כלבים נובחים / חתולים בורחים' },
  shadow:  { icon: '🌑', text: 'הצל לא תואם!' },
};
export const TELL_IDS = Object.keys(TELLS);

export const DIFF = {
  easy:   { he: 'קל',     tells: 6, herrings: 0, freq: 1.6, auto: 'toast', boss: 380, bossDmg: 0.7, coins: 80,  monsterSpeed: 3.8 },
  medium: { he: 'בינוני', tells: 4, herrings: 2, freq: 1.0, auto: 'hint',  boss: 560, bossDmg: 1.0, coins: 150, monsterSpeed: 4.5 },
  hard:   { he: 'קשה',    tells: 3, herrings: 4, freq: 0.7, auto: 'silent', boss: 800, bossDmg: 1.3, coins: 250, monsterSpeed: 5.2 },
};
