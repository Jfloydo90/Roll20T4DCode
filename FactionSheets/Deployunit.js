// === Deploy Unit Script with Overwrite & Token Setup ===
const deployLocks = {};

on('chat:message', function (msg) {
  if (msg.type !== 'api' || !msg.content.startsWith('!deployunit')) return;

  const args = msg.content.trim().split(/\s+--/);
  const unitName = args[1]?.replace(/^"|"$/g, '');
  const sourceSheet = args[2]?.replace(/^"|"$/g, '');
  const setDefault = args.includes('setdefault');

  if (!unitName || !sourceSheet) {
    sendChat('DeployUnit', '/w gm Usage: !deployunit --"Unit Name" --"Source Sheet" [--setdefault]');
    return;
  }

  const lockKey = `${msg.playerid}-${unitName}`;
  if (deployLocks[lockKey]) return;
  deployLocks[lockKey] = true;
  setTimeout(() => { delete deployLocks[lockKey]; }, 1000);

  const findChar = name => findObjs({ _type: 'character', name })[0];
  const sourceChar = findChar(sourceSheet);
  if (!sourceChar) return sendChat('DeployUnit', `/w gm Source sheet not found: ${sourceSheet}`);

  const unitAttrs = findObjs({ _type: 'attribute', _characterid: sourceChar.id })
    .filter(attr => attr.get('name').includes('repeating_units_'));

  const grouped = {};
  unitAttrs.forEach(attr => {
    const match = attr.get('name').match(/repeating_units_([^_]+)_(.+)/);
    if (!match) return;
    const [_, id, key] = match;
    if (!grouped[id]) grouped[id] = {};
    grouped[id][key] = attr.get('current');
  });

  const unitData = Object.values(grouped).find(u => u.UnitName === unitName);
  if (!unitData) return sendChat('DeployUnit', `/w gm Unit not found in ${sourceSheet}: ${unitName}`);

  let newChar = findChar(`Unit - ${unitName}`);
  const isNew = !newChar;
  if (!newChar) {
    newChar = createObj('character', {
      name: `Unit - ${unitName}`,
      controlledby: '',
      inplayerjournals: ''
    });
  }

const attrMap = {};

const setAttr = (name, val) => {
  let attr = findObjs({ _type: 'attribute', _characterid: newChar.id, name })[0];
  if (!attr) attr = createObj('attribute', { _characterid: newChar.id, name });
  attr.set('current', val ?? '');
  attrMap[name] = attr; // Store it for later linking
};


  const delAttr = (name) => {
    const attr = findObjs({ _type: 'attribute', _characterid: newChar.id, name })[0];
    if (attr) attr.remove();
  };

  const copyAttr = name => {
    const attr = findObjs({ _type: 'attribute', _characterid: sourceChar.id, name })[0];
    if (attr) setAttr(name, attr.get('current'));
  };

  // Core attributes
  setAttr('UnitName', unitData.UnitName || '');
  setAttr('UnitArmyGroup', unitData.UnitArmyGroup || '');
  setAttr('UnitCurrentHP', unitData.UnitCurrentHP || '');
  setAttr('UnitMaxHP', unitData.UnitMaxHP || '');
  setAttr('UnitDMG', unitData.UnitDMG || '');
  setAttr('UnitAttackBonus', unitData.UnitAttackBonus || '');
  setAttr('UnitMVMT', unitData.UnitMVMT || '');
  setAttr('UnitINIT', unitData.UnitINIT || '');

  // Copy only army-relevant stats
  [
    'ArmyLeaderName', 'ArmyLeaderCommand', 'ArmyLeaderOperations',
    'ArmyLeaderInstinct', 'ArmyLeaderAwareness',
    'ArmyINDMod','ArmyLOGMod','ArmySTBMod','ArmyINNMod',
    'ArmyGOVMod','ArmyDIPMod','ArmyRSPMod','ArmyEFFMod','ArmyKNWMod',
    'ArmyStrainPenalty'
  ].forEach(copyAttr);

  // Cleanup junk stats
  [
    'INDModCached','LOGModCached','STBModCached','INNModCached',
    'GOVModCached','DIPModCached','RSPModCached','EFFModCached','KNWModCached',
    'StrainPenaltyCached','RSP','EFF','KNW'
  ].forEach(delAttr);

// Remove duplicated/legacy/cached attributes (fuzzy match cleanup)
const removeDupes = [
  'Cached', 'Echo', 'RSP', 'EFF', 'KNW'
];

findObjs({ _type: 'attribute', _characterid: newChar.id }).forEach(attr => {
  const name = attr.get('name');
  if (removeDupes.some(str => name.includes(str)) && ![
    'ArmyRSPMod','ArmyEFFMod','ArmyKNWMod'
  ].includes(name)) {
    attr.remove();
  }
});

  const addAbility = (name, action) => {
    let ability = findObjs({ _type: 'ability', characterid: newChar.id, name })[0];
    if (!ability) ability = createObj('ability', { characterid: newChar.id, name, istokenaction: true });
    ability.set('action', action);
  };

  addAbility('Attack',
    `&{template:t4d_attack} {{title=@{UnitName} Attack Roll}} {{character=@{character_name}}} ` +
    `{{Hit=[[1d20 + (0 + @{UnitAttackBonus}) + (0 + @{ArmyStrainPenalty}) + floor((?{Which Skill?|Command,@{ArmyLeaderCommand}|Operations,@{ArmyLeaderOperations}|Instinct,@{ArmyLeaderInstinct}|Awareness,@{ArmyLeaderAwareness}})/4) + (0 + @{ArmyLOGMod}) + (0 + ?{Other Modifiers|0})]]}} ` +
    `{{Damage=[[@{UnitDMG}]]}}`);

  addAbility('Initiative',
    `/me rolls Initiative!\n[[{1d8 - @{ArmyRSPMod} - @{UnitINIT} + ?{Other Modifiers|0}, 1d1}kh1 &{tracker:+}]]`);

// === Token Setup ===
const tokens = findObjs({ _type: 'graphic', represents: newChar.id });
const hp = parseInt(unitData.UnitMaxHP || '0', 10);
const hpHalf = Math.floor(hp / 2);
const mvmt = parseInt(unitData.UnitMVMT || '0', 10);

// Set up selected token if available
const selectedToken = (msg.selected && msg.selected.length) ? getObj('graphic', msg.selected[0]._id) : null;
let tokenForDefault = null;

if (selectedToken && selectedToken.get('subtype') === 'token') {
  selectedToken.set({
    represents: newChar.id,
    bar1_link: attrMap['UnitCurrentHP']?.id || '',
    bar1_value: unitData.UnitCurrentHP,
    bar1_max: unitData.UnitMaxHP,
    bar2_link: '',
    bar2_value: hpHalf,
    bar2_max: unitData.UnitMaxHP,
    bar3_link: attrMap['UnitMVMT']?.id || '',
    bar3_value: mvmt,
    bar3_max: mvmt
  });
  tokenForDefault = selectedToken;
}

// Update existing tokens
tokens.forEach(token => {
  token.set({
    represents: newChar.id,
    bar1_link: attrMap['UnitCurrentHP']?.id || '',
    bar1_value: unitData.UnitCurrentHP,
    bar1_max: unitData.UnitMaxHP,
    bar2_link: '',
    bar2_value: hpHalf,
    bar2_max: unitData.UnitMaxHP,
    bar3_link: attrMap['UnitMVMT']?.id || '',
    bar3_value: mvmt,
    bar3_max: mvmt
  });

  // If no selected token, use first valid one
  if (!tokenForDefault) tokenForDefault = token;
});

// Save default token ONCE
if (tokenForDefault) {
  const tokenProps = [
    'represents', 'name', 'imgsrc',
    'bar1_link', 'bar1_value', 'bar1_max',
    'bar2_link', 'bar2_value', 'bar2_max',
    'bar3_link', 'bar3_value', 'bar3_max'
  ];
  const data = {};
  tokenProps.forEach(p => data[p] = tokenForDefault.get(p));
  newChar.set('defaulttoken', JSON.stringify(data));
}

sendChat('DeployUnit', `/w gm Unit '${unitName}' ${isNew ? 'deployed' : 'updated'} as '${newChar.get('name')}' and default token stored`);
});
