import auth from '@react-native-firebase/auth';
import firebase from '@react-native-firebase/app';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import type { MatchPosition } from '../../types/matchPublication';

const COLLECTION = 'publicMatchApplications';
const CLOUD_FUNCTIONS_REGION = 'us-central1';

type ApplicationStatus = 'pending' | 'accepted' | 'rejected';
type MembershipMode = 'temporary' | 'permanent' | null;

export type PublicMatchApplication = {
    id: string;
    listingId: string;
    groupId: string;
    sourceMatchId: string;
    sourceMatchType: 'matches' | 'matchesByTeams' | 'matchesByChallenge';
    applicantUserId: string;
    applicantDisplayName: string;
    applicantPhotoURL: string | null;
    note: string | null;
    preferredPositions: MatchPosition[];
    status: ApplicationStatus;
    membershipMode: MembershipMode;
    reviewedByUserId: string | null;
    reviewedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

const toIsoString = (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
    return null;
};

const mapDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): PublicMatchApplication => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
        id: doc.id,
        listingId: String(d.listingId ?? ''),
        groupId: String(d.groupId ?? ''),
        sourceMatchId: String(d.sourceMatchId ?? ''),
        sourceMatchType: (d.sourceMatchType as PublicMatchApplication['sourceMatchType']) ?? 'matches',
        applicantUserId: String(d.applicantUserId ?? ''),
        applicantDisplayName: String(d.applicantDisplayName ?? ''),
        applicantPhotoURL: d.applicantPhotoURL ? String(d.applicantPhotoURL) : null,
        note: d.note ? String(d.note) : null,
        preferredPositions: Array.isArray(d.preferredPositions)
            ? (d.preferredPositions as MatchPosition[])
            : [],
        status: (d.status as ApplicationStatus) ?? 'pending',
        membershipMode: (d.membershipMode as MembershipMode) ?? null,
        reviewedByUserId: d.reviewedByUserId ? String(d.reviewedByUserId) : null,
        reviewedAt: toIsoString(d.reviewedAt),
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt),
    };
};

const getCallableEndpoint = (name: string): string => {
    const projectId = firebase.app().options.projectId;
    if (!projectId) {
        throw new Error('No se pudo obtener el proyecto de Firebase.');
    }
    return `https://${CLOUD_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${name}`;
};

export function subscribeApplicationsByApplicant(
    applicantUserId: string,
    onNext: (rows: PublicMatchApplication[]) => void,
    onError?: (error: Error) => void,
): () => void {
    return firestore()
        .collection(COLLECTION)
        .where('applicantUserId', '==', applicantUserId)
        .orderBy('createdAt', 'desc')
        .onSnapshot(
            snap => onNext(snap.docs.map(mapDoc)),
            err => {
                onError?.(err)
            },
        );
}

export function subscribePendingApplicationsByGroup(
    groupId: string,
    onNext: (rows: PublicMatchApplication[]) => void,
    onError?: (error: Error) => void,
): () => void {
    return firestore()
        .collection(COLLECTION)
        .where('groupId', '==', groupId)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'asc')
        .onSnapshot(
            snap => onNext(snap.docs.map(mapDoc)),
            err => {
                onError?.(err)
            },
        );
}

export async function applyToPublicMatchListing(params: {
    listingId: string;
    note?: string | null;
    preferredPositions?: MatchPosition[];
}): Promise<{ applicationId: string }> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
        throw new Error('Debes iniciar sesión para postularte.');
    }

    const endpoint = getCallableEndpoint('applyPublicMatchApplication');
    const idToken = await currentUser.getIdToken();

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
            data: {
                listingId: params.listingId,
                note: params.note ?? null,
                preferredPositions: params.preferredPositions ?? [],
            },
        }),
    });

    const payload = (await response.json().catch(() => null)) as
        | { result?: unknown; data?: unknown; error?: { message?: string } }
        | null;

    if (!response.ok || payload?.error) {
        const message = payload?.error?.message ?? 'No se pudo enviar la postulación.';
        throw new Error(message);
    }

    const data = (payload?.result ?? payload?.data ?? {}) as { applicationId?: string };
    return { applicationId: String(data.applicationId ?? '') };
}

export async function reviewPublicMatchApplication(params: {
    applicationId: string;
    decision: 'accepted' | 'rejected';
    membershipMode?: 'temporary' | 'permanent';
}): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
        throw new Error('Debes iniciar sesión para gestionar postulaciones.');
    }

    const endpoint = getCallableEndpoint('reviewPublicMatchApplication');
    const idToken = await currentUser.getIdToken();

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
            data: {
                applicationId: params.applicationId,
                decision: params.decision,
                membershipMode: params.membershipMode ?? 'temporary',
            },
        }),
    });

    const payload = (await response.json().catch(() => null)) as
        | { result?: unknown; data?: unknown; error?: { message?: string } }
        | null;

    if (!response.ok || payload?.error) {
        const message = payload?.error?.message ?? 'No se pudo procesar la postulación.';
        throw new Error(message);
    }
}

