// נתוני נשקים – מקור אחד לכל המשחק. dmg = נזק לפגיעה, rpm = יריות לדקה, range = מטרים.
export const RARITY = {
  common:    { he: 'רגיל',  color: '#c9ced6', weight: 60 },
  rare:      { he: 'נדיר',  color: '#3ddc84', weight: 25 },
  epic:      { he: 'אפי',   color: '#3d8bff', weight: 10 },
  legendary: { he: 'אגדי',  color: '#b44dff', weight: 4 },
  mythic:    { he: 'מיתי',  color: '#ffc531', weight: 1 },
};

export const WEAPONS = [
  { id: 'knife',   he: 'סכין',        kind: 'melee',  dmg: 45, rpm: 90,  mag: 0,  range: 2,   head: 1.5, rarity: 'common' },
  { id: 'pistol',  he: 'אקדח',        kind: 'gun',    dmg: 22, rpm: 300, mag: 12, range: 40,  head: 2,   rarity: 'common' },
  { id: 'rifle',   he: 'רובה סער',    kind: 'gun',    dmg: 18, rpm: 600, mag: 30, range: 70,  head: 2,   rarity: 'rare' },
  { id: 'smg',     he: 'תת־מקלע',     kind: 'gun',    dmg: 12, rpm: 900, mag: 35, range: 30,  head: 1.6, rarity: 'rare' },
  { id: 'shotgun', he: 'שוטגן',       kind: 'gun',    dmg: 9,  rpm: 70,  mag: 6,  range: 15,  head: 1.5, rarity: 'epic', pellets: 8 },
  { id: 'sniper',  he: 'צלף',         kind: 'gun',    dmg: 85, rpm: 40,  mag: 5,  range: 200, head: 2.5, rarity: 'legendary', scope: true },
  { id: 'grenade', he: 'רימון',       kind: 'throw',  dmg: 90, rpm: 30,  mag: 1,  range: 25,  head: 1,   rarity: 'epic', radius: 5 },
  { id: 'plasma',  he: 'רובה פלזמה',  kind: 'gun',    dmg: 30, rpm: 450, mag: 25, range: 80,  head: 2,   rarity: 'mythic' },
];

export const weapon = (id) => WEAPONS.find((w) => w.id === id);
