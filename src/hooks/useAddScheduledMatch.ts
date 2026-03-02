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
};

const PLAYERS_BY_TYPE: Record<string, number> = {
  futbol_5: 5,
  futbol_7: 7,
  futbol_11: 11,
};

const createEmptySlots = (count: number): ScheduledSlot[] =>
  Array.from({ length: count }, () => ({ groupMemberId: null, position: null }));

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
    createEmptySlots(playersPerTeam),
  );
  const [team2Slots, setTeam2Slots] = useState<ScheduledSlot[]>(() =>
    createEmptySlots(playersPerTeam),
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
    setTeam1Slots(createEmptySlots(playersPerTeam));
    setTeam2Slots(createEmptySlots(playersPerTeam));
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
    setSlots(prev =>
      prev.map((s, i) => (i === slotIndex ? { ...s, position } : s)),
    );
  };

  const clearSlot = (team: 1 | 2, slotIndex: number) => {
    const setSlots = team === 1 ? setTeam1Slots : setTeam2Slots;
    setSlots(prev =>
      prev.map((s, i) =>
        i === slotIndex ? { groupMemberId: null, position: null } : s,
      ),
    );
  };

  const filledCount = (slots: ScheduledSlot[]) =>
    slots.filter(s => s.groupMemberId !== null).length;

  return {
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
    filledCount,
  };
}
