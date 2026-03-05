import { useState, useEffect, useMemo } from 'react';

import { useAppSelector } from '../app/hooks';
import {
  getGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';

export type ScheduledPosition = 'POR' | 'DEF' | 'MED' | 'DEL';

export type ScheduledSlot = {
  groupMemberId: string | null;
  position: ScheduledPosition | null;
  isSub: boolean;
};

const PLAYERS_BY_TYPE: Record<string, number> = {
  futbol_5: 5,
  futbol_7: 7,
  futbol_11: 11,
};

const POSITION_ORDER: Record<string, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

const DEFAULT_FORMATION: Record<string, ScheduledPosition[]> = {
  futbol_5:  ['POR', 'DEF', 'DEF', 'DEL', 'DEL'],
  futbol_7:  ['POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'DEL'],
  futbol_11: ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'],
};

const createEmptySlots = (count: number, groupType: string): ScheduledSlot[] =>
  Array.from({ length: count }, (_, i) => {
    const formation = DEFAULT_FORMATION[groupType];
    const position: ScheduledPosition = formation?.[i] ?? (i === 0 ? 'POR' : 'DEF');
    return { groupMemberId: null, position, isSub: false };
  });

export function useAddScheduledMatch() {
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const playersPerTeam = PLAYERS_BY_TYPE[selectedGroup?.type ?? 'futbol_7'] ?? 7;

  const [matchDate, setMatchDate] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTeam, setActiveTeam] = useState<'1' | '2'>('1');
  const [team1Slots, setTeam1Slots] = useState<ScheduledSlot[]>(() =>
    createEmptySlots(playersPerTeam, selectedGroup?.type ?? 'futbol_7'),
  );
  const [team2Slots, setTeam2Slots] = useState<ScheduledSlot[]>(() =>
    createEmptySlots(playersPerTeam, selectedGroup?.type ?? 'futbol_7'),
  );
  const [allMembers, setAllMembers] = useState<GroupMemberV2[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  // Which slot has the player picker open
  const [pickerTeam, setPickerTeam] = useState<1 | 2 | null>(null);
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedGroupId) return;
    setIsLoadingMembers(true);
    getGroupMembersV2ByGroupId(selectedGroupId)
      .then(members => {
        setAllMembers(members);
        setIsLoadingMembers(false);
      })
      .catch(() => setIsLoadingMembers(false));
  }, [selectedGroupId]);

  // Reset slots when group type changes
  useEffect(() => {
    setTeam1Slots(createEmptySlots(playersPerTeam, selectedGroup?.type ?? 'futbol_7'));
    setTeam2Slots(createEmptySlots(playersPerTeam, selectedGroup?.type ?? 'futbol_7'));
  }, [playersPerTeam]);

  const team1Ids = useMemo(
    () => new Set(team1Slots.map(s => s.groupMemberId).filter(Boolean) as string[]),
    [team1Slots],
  );

  const team2Ids = useMemo(
    () => new Set(team2Slots.map(s => s.groupMemberId).filter(Boolean) as string[]),
    [team2Slots],
  );

  const openPicker = (team: 1 | 2, slotIndex: number) => {
    setPickerTeam(team);
    setPickerSlotIndex(slotIndex);
  };

  const closePicker = () => {
    setPickerTeam(null);
    setPickerSlotIndex(null);
  };

  const selectPlayer = (memberId: string | null) => {
    if (pickerTeam === null || pickerSlotIndex === null) return;
    const setSlots = pickerTeam === 1 ? setTeam1Slots : setTeam2Slots;
    setSlots(prev =>
      prev.map((s, i) =>
        i === pickerSlotIndex ? { ...s, groupMemberId: memberId } : s,
      ),
    );
    closePicker();
  };

  const setPosition = (
    team: 1 | 2,
    slotIndex: number,
    position: ScheduledPosition | null,
  ) => {
    const setSlots = team === 1 ? setTeam1Slots : setTeam2Slots;
    setSlots(prev => {
      const updated = prev.map((s, i) => (i === slotIndex ? { ...s, position } : s));
      // Sort starters and subs separately, keeping subs below starters
      const starters = [...updated.filter(s => !s.isSub)].sort(
        (a, b) => (POSITION_ORDER[a.position ?? ''] ?? 99) - (POSITION_ORDER[b.position ?? ''] ?? 99),
      );
      const subs = [...updated.filter(s => s.isSub)].sort(
        (a, b) => (POSITION_ORDER[a.position ?? ''] ?? 99) - (POSITION_ORDER[b.position ?? ''] ?? 99),
      );
      return [...starters, ...subs];
    });
  };

  const clearSlot = (team: 1 | 2, slotIndex: number) => {
    const setSlots = team === 1 ? setTeam1Slots : setTeam2Slots;
    setSlots(prev =>
      prev.map((s, i) =>
        i === slotIndex ? { ...s, groupMemberId: null } : s,
      ),
    );
  };

  const addSub = (team: 1 | 2) => {
    const setSlots = team === 1 ? setTeam1Slots : setTeam2Slots;
    setSlots(prev => [
      ...prev,
      { groupMemberId: null, position: 'DEF', isSub: true },
    ]);
  };

  const removeSub = (team: 1 | 2, slotIndex: number) => {
    const setSlots = team === 1 ? setTeam1Slots : setTeam2Slots;
    setSlots(prev => prev.filter((_, i) => i !== slotIndex));
  };

  const filledCount = (slots: ScheduledSlot[]) =>
    slots.filter(s => s.groupMemberId !== null).length;

  return {
    selectedGroupId,
    selectedGroup,
    playersPerTeam,
    matchDate,
    setMatchDate,
    showDatePicker,
    setShowDatePicker,
    activeTeam,
    setActiveTeam,
    team1Slots,
    team2Slots,
    allMembers,
    isLoadingMembers,
    team1Ids,
    team2Ids,
    pickerTeam,
    pickerSlotIndex,
    openPicker,
    closePicker,
    selectPlayer,
    setPosition,
    clearSlot,
    addSub,
    removeSub,
    filledCount,
  };
}
