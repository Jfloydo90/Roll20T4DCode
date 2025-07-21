// Clean Army Sync Script (with Leader Override & Stat Mod Sync)
on('chat:message', function (msg) {
  if (msg.type !== 'api' || !msg.content.startsWith('!sync')) return;

  const args = msg.content.split('--').map(s => s.trim());
  if (args.length < 3) {
    sendChat('ArmySync', '/w gm Usage: !sync --FactionSheet --ArmySheet [--LeaderX]');
    return;
  }

  const [_, sourceName, targetName, overrideLeader] = args;
  const sourceChar = findObjs({ _type: 'character', name: sourceName })[0];
  const targetChar = findObjs({ _type: 'character', name: targetName })[0];

  if (!sourceChar || !targetChar) {
    sendChat('ArmySync', `/w gm Could not find character sheets: ${sourceName}, ${targetName}`);
    return;
  }

  const getAttrVal = (charID, name) => {
    const attr = findObjs({ _type: 'attribute', _characterid: charID, name })[0];
    return attr ? attr.get('current') : '';
  };

  const setAttr = (charID, name, value) => {
    let attr = findObjs({ _type: 'attribute', _characterid: charID, name })[0];
    if (!attr) {
      attr = createObj('attribute', { _characterid: charID, name });
    }
    attr.set('current', value);
  };

  const attrQuery = (charID, prefix) =>
    findObjs({ _type: 'attribute', _characterid: charID })
      .filter(a => a.get('name').startsWith(prefix));

  const grouped = (list, keys) => {
    const map = {};
    list.forEach(attr => {
      const match = attr.get('name').match(/repeating_\w+_([^_]+)_(.+)/);
      if (!match) return;
      const [_, id, key] = match;
      if (!map[id]) map[id] = {};
      map[id][key] = attr.get('current');
    });
    return Object.values(map).filter(obj => keys.every(k => obj[k]));
  };

  const sourceID = sourceChar.id;
  const targetID = targetChar.id;
  const armyNum = getAttrVal(targetID, 'ArmyNumber');

  // === Sync Leader ===
  const leaderAttrs = attrQuery(sourceID, 'repeating_leaders_');
  const leaders = grouped(leaderAttrs, ['LeaderNumber']);
  const leader = overrideLeader
    ? leaders.find(l => l.LeaderNumber === overrideLeader)
    : leaders.find(l => l.LeaderNumber.endsWith(armyNum));

  if (leader) {
    setAttr(targetID, 'ArmyLeaderName', leader.LeaderName || '');
    setAttr(targetID, 'ArmyLeaderCommand', leader.LeaderCommandLevel || '0');
    setAttr(targetID, 'ArmyLeaderOperations', leader.LeaderOperationsLevel || '0');
    setAttr(targetID, 'ArmyLeaderInstinct', leader.LeaderInstinctLevel || '0');
    setAttr(targetID, 'ArmyLeaderAwareness', leader.LeaderAwarenessLevel || '0');
  }

  // === Sync Primary & Secondary Modifiers ===
  const modMap = [
  ['INDModCached', 'ArmyINDMod'],
  ['LOGModCached', 'ArmyLOGMod'],
  ['STBModCached', 'ArmySTBMod'],
  ['INNModCached', 'ArmyINNMod'],
  ['GOVModCached', 'ArmyGOVMod'],
  ['DIPModCached', 'ArmyDIPMod'],
  ['RSPModCached', 'ArmyRSPMod'],
  ['EFFModCached', 'ArmyEFFMod'],
  ['KNWModCached', 'ArmyKNWMod'],
  ['StrainPenaltyCached', 'ArmyStrainPenalty']
];
  modMap.forEach(([sourceAttr, targetAttr]) => {
    const val = getAttrVal(sourceID, sourceAttr);
    setAttr(targetID, targetAttr, val);
  });

  // === Clear old army units ===
  const oldUnitAttrs = attrQuery(targetID, 'repeating_units_');
  const rowIDs = [...new Set(
    oldUnitAttrs.map(a => a.get('name').match(/repeating_units_([^_]+)_/)).filter(Boolean).map(m => m[1])
  )];
  rowIDs.forEach(id => {
    oldUnitAttrs
      .filter(a => a.get('name').startsWith(`repeating_units_${id}_`))
      .forEach(attr => attr.remove());
  });

  // === Sync Units ===
  const unitAttrs = attrQuery(sourceID, 'repeating_units_');
  const units = grouped(unitAttrs, [
    'UnitArmyGroup', 'UnitName', 'UnitMaxHP', 'UnitDMG',
    'UnitAttackBonusFinal', 'UnitMVMT', 'UnitInitiative'
  ]);
  const matchingUnits = units.filter(u => u.UnitArmyGroup === armyNum);

  const generateRowID = () => [...Array(15)].map(() => Math.floor(Math.random()*16).toString(16)).join('');
  const newIDs = [];

  matchingUnits.forEach(unit => {
    const rowID = generateRowID();
    newIDs.push(rowID);
    const set = (name, value) => createObj('attribute', {
      _characterid: targetID,
      name: `repeating_units_${rowID}_${name}`,
      current: value ?? ''
    });

    set('UnitName', unit.UnitName);
    set('UnitCurrentHP', '');
    set('UnitMaxHP', unit.UnitMaxHP);
    set('UnitDMG', unit.UnitDMG);
    set('UnitAttackBonus', unit.UnitAttackBonusFinal);
    set('UnitMVMT', unit.UnitMVMT);
    set('UnitINIT', unit.UnitInitiative);
    set('UnitArmyGroup', armyNum);
  });

  if (newIDs.length) {
    const reporder = findObjs({ _type: 'attribute', _characterid: targetID, name: '_reporder_repeating_units' })[0]
      || createObj('attribute', { _characterid: targetID, name: '_reporder_repeating_units' });
    reporder.set('current', newIDs.join(','));
  }

  sendChat('ArmySync', `/w gm Synced Army ${armyNum} from ${sourceName} to ${targetName}${overrideLeader ? ` with Leader ${overrideLeader}` : ''}`);
});
