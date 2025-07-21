// Enhanced Unit Deployment & Update Script for Roll20
on('chat:message', function(msg) {
  if (msg.type !== 'api') return;

  const deployMatch = msg.content.match(/^!deployunit\s+--"(.+?)"\s+--"(.+?)"$/i);
  const updateMatch = msg.content.match(/^!updateunit\s+--"(.+?)"\s+--"(.+?)"$/i);

  const findChar = name => findObjs({ _type: 'character', name })[0];
  const setAttr = (charID, name, val) => {
    let attr = findObjs({ _type: 'attribute', _characterid: charID, name })[0];
    if (!attr) attr = createObj('attribute', { _characterid: charID, name });
    attr.set('current', val ?? '');
  };
  const copyAttr = (sourceID, targetID, name) => setAttr(targetID, name, getAttrByName(sourceID, name));

  const addAbilities = (charID) => {
    const add = (name, action) => {
      createObj('ability', {
        characterid: charID, name, action, istokenaction: true
      });
    };
    add('Attack', `&{template:t4d_attack} {{title=@{UnitName} Attack Roll}} {{character=@{character_name}}} {{Hit=[[1d20 + @{UnitAttackBonus} + @{ArmyStrainPenalty} + floor((?{Which Skill?|Command,@{ArmyLeaderCommand}|Operations,@{ArmyLeaderOperations}|Instinct,@{ArmyLeaderInstinct}|Awareness,@{ArmyLeaderAwareness}})/4) + @{ArmyLOGMod} + ?{Other Modifiers|0}]]}} {{Damage=[[@{UnitDMG}]]}}`);
    add('Initiative', `&{template:t4d_initiative} {{title=@{UnitName}'s Initiative}} {{Roll=[[1d8 - @{ArmyRSPMod} - @{UnitINIT} + ?{Other Modifiers|0}]]}}`);
  };

  const processUnit = (unitName, sourceSheet, mode) => {
    const sourceChar = findChar(sourceSheet);
    const targetChar = mode === 'deploy' ? null : findChar(`Unit - ${unitName}`);
    if (!sourceChar || (mode === 'update' && !targetChar)) {
      sendChat(mode, `/w gm Could not find ${mode === 'update' ? 'target' : 'source'} sheet: ${unitName}`);
      return;
    }

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
    if (!unitData) {
      sendChat(mode, `/w gm Unit not found: ${unitName}`);
      return;
    }

    const charID = mode === 'deploy'
      ? createObj('character', {
          name: `Unit - ${unitName}`, controlledby: '', inplayerjournals: ''
        }).id
      : targetChar.id;

    setAttr(charID, 'UnitName', unitData.UnitName);
    setAttr(charID, 'UnitArmyGroup', unitData.UnitArmyGroup);
    if (mode === 'deploy') setAttr(charID, 'UnitCurrentHP', unitData.UnitMaxHP);
    setAttr(charID, 'UnitMaxHP', unitData.UnitMaxHP);
    setAttr(charID, 'UnitDMG', unitData.UnitDMG);
    setAttr(charID, 'UnitAttackBonus', unitData.UnitAttackBonus);
    setAttr(charID, 'UnitMVMT', unitData.UnitMVMT);
    setAttr(charID, 'UnitINIT', unitData.UnitINIT);

    ['ArmyLeaderName', 'ArmyLeaderCommand', 'ArmyLeaderOperations', 'ArmyLeaderInstinct', 'ArmyLeaderAwareness', 'ArmyLOGMod', 'ArmyRSPMod', 'ArmyStrainPenalty']
      .forEach(attr => copyAttr(sourceChar.id, charID, attr));

    if (mode === 'deploy') addAbilities(charID);

    sendChat(mode === 'deploy' ? 'DeployUnit' : 'UpdateUnit', `/w gm Unit '${unitName}' ${mode}ed from '${sourceSheet}'`);
  };

  if (deployMatch) {
    const [, unitName, sourceSheet] = deployMatch;
    processUnit(unitName, sourceSheet, 'deploy');
  } else if (updateMatch) {
    const [, unitName, sourceSheet] = updateMatch;
    processUnit(unitName, sourceSheet, 'update');
  }
});
