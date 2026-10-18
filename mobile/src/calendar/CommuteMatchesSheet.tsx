import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { startMatchChat } from '../chat/chatClient';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MapView, { Circle, Marker } from 'react-native-maps';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import {
  dayModeLabels,
  METERS_PER_MILE,
  type Coordinates,
  type DayMode,
} from '../commute/commuteModel';
import {
  findTripRequest,
  requestCanCancel,
  requestRecipient,
  type RideRequest,
} from '../mvp/rideRequestModel';
import { rideTime } from '../mvp/ridePresentation';
import { trafficForecastIsStale } from '../routing/types';
import type { CalendarMatch, CalendarSearchResult } from './calendarMatching';
import {
  MATCH_PAGE_SIZES,
  matchedPeople,
  matchPage,
  matchMapRegion,
  type MatchPageSize,
} from './matchPresentation';
import { colors, radii, spacing } from '../theme';

export function CommuteMatchesSheet({
  date,
  mode,
  uid,
  ownPoint,
  result,
  busy: parentBusy,
  nowEpochSeconds,
  requesting,
  cancellingId,
  message,
  requests,
  onLoadMore,
  onRetry,
  onRequest,
  onReviewRequests,
  vehicleLoaded,
  vehicleReady,
  onVehicleRequired,
  onCancel,
  onClose,
}: {
  date: string;
  mode: DayMode;
  uid: string;
  ownPoint: Coordinates;
  result: CalendarSearchResult | null;
  busy: boolean;
  nowEpochSeconds: number;
  requesting: boolean;
  cancellingId: string | null;
  message: string | null;
  requests: RideRequest[];
  onLoadMore: () => void;
  onRetry: () => void;
  onRequest: (match: CalendarMatch) => void;
  onReviewRequests: () => void;
  vehicleLoaded: boolean;
  vehicleReady: boolean;
  onVehicleRequired: () => void;
  onCancel: (request: RideRequest) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [chatBusy, setChatBusy] = useState(false);
  const chatLock = useRef(false);
  const [chatError, setChatError] = useState('');
  const busy = parentBusy || chatBusy;
  const openChat = async (candidate: CalendarMatch) => {
    if (chatLock.current || parentBusy) return;
    chatLock.current = true;
    setChatBusy(true);
    setChatError('');
    try {
      const thread = await startMatchChat(candidate, date);
      chatLock.current = false;
      dismiss(() => { onClose(); router.push(`/inbox/${thread.id}`); });
    } catch (failure) {
      setChatError(failure instanceof Error ? failure.message : 'Could not start chat. Please retry.');
    } finally { chatLock.current = false; setChatBusy(false); }
  };
  const [visible, setVisible] = useState(true);
  const [pageSize, setPageSize] = useState<MatchPageSize>(5);
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [driverOption, setDriverOption] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const [detailSlide] = useState(() => new Animated.Value(1));
  const afterDismiss = useRef(onClose);
  const dismissed = useRef(false);
  const people = matchedPeople(result?.matches ?? [], uid);
  const current = matchPage(people, pageSize, page);
  const person = people.find((item) => item.id === detailId);
  const selectedMatch =
    person?.options.find((item) => item.driverId === driverOption) ?? person?.options[0];
  const request = selectedMatch ? findTripRequest(requests, selectedMatch, date) : undefined;
  const match =
    person?.options.find(
      (item) =>
        request &&
        (request.status === 'PENDING' || request.status === 'ACCEPTED') &&
        item.driverId === request.driverId,
    ) ?? selectedMatch;
  const detailOpen = !!person && !!match;
  const staleTraffic = trafficForecastIsStale(match?.eta, nowEpochSeconds);
  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  useEffect(() => {
    if (!detailId) return;
    detailSlide.setValue(1);
    const animation = Animated.timing(detailSlide, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [detailId, detailSlide]);
  const finishDismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    afterDismiss.current();
  };
  const dismiss = (action: () => void) => {
    // Never dismiss while a persisted request is being sent.
    if (requesting || chatLock.current || !visible) return;
    afterDismiss.current = action;
    if (Platform.OS === 'ios') setVisible(false);
    else finishDismiss();
  };
  const closeDetails = () => {
    if (requesting || chatLock.current) return;
    Animated.timing(detailSlide, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDetailId(null);
    });
  };
  const requestActions = (candidate: CalendarMatch, fromCard = false) => {
    const existing = findTripRequest(requests, candidate, date);
    if (existing?.status === 'PENDING')
      return (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.status}>
            {requestRecipient(existing) === uid ? 'Waiting for your answer' : 'Request pending'}
          </Text>
          {requestCanCancel(existing, uid) ? (
            <AppButton
              label={cancellingId === existing.id ? 'Cancelling…' : 'Cancel request'}
              variant="secondary"
              disabled={busy}
              onPress={() => onCancel(existing)}
            />
          ) : (
            <AppButton
              label="Review request"
              disabled={busy}
              onPress={() => dismiss(onReviewRequests)}
            />
          )}
        </View>
      );
    if (existing && existing.status !== 'CANCELLED')
      return (
        <Text style={styles.status}>
          {existing.status === 'ACCEPTED' ? 'Confirmed ride' : 'Request declined'}
        </Text>
      );
    return (
      <AppButton
        label={
          requesting && !cancellingId
            ? 'Sending…'
            : fromCard
              ? 'Request to carpool'
              : 'Send request'
        }
        disabled={
          busy ||
          (!fromCard &&
            (trafficForecastIsStale(candidate.eta, nowEpochSeconds) ||
              (candidate.driverId === uid && !vehicleLoaded)))
        }
        onPress={() => {
          if (fromCard) {
            setDriverOption(candidate.driverId);
            setDetailId(candidate.driverId === uid ? candidate.riderId : candidate.driverId);
          } else if (candidate.driverId === uid && !vehicleReady) dismiss(onVehicleRequired);
          else onRequest(candidate);
        }}
      />
    );
  };
  const changePage = (value: number) => {
    setPage(value);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const pager = (position: string) => (
    <View style={styles.pager}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Previous page, ${position}`}
        accessibilityState={{ disabled: current.page === 0 || busy }}
        disabled={current.page === 0 || busy}
        onPress={() => changePage(current.page - 1)}
        style={[styles.pageButton, (current.page === 0 || busy) && styles.disabled]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.accent} />
        <Text style={styles.link}>Previous</Text>
      </Pressable>
      <Text style={styles.pageLabel}>
        Page {current.page + 1} of {current.pages}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Next page, ${position}`}
        accessibilityState={{ disabled: current.page + 1 >= current.pages || busy }}
        disabled={current.page + 1 >= current.pages || busy}
        onPress={() => changePage(current.page + 1)}
        style={[styles.pageButton, (current.page + 1 >= current.pages || busy) && styles.disabled]}
      >
        <Text style={styles.link}>Next</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.accent} />
      </Pressable>
    </View>
  );
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={() => (detailOpen ? closeDetails() : dismiss(onClose))}
      onDismiss={finishDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close matches"
          disabled={requesting || chatBusy}
          onPress={() => dismiss(onClose)}
          style={styles.backdrop}
        />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
          <View
            style={styles.list}
            pointerEvents={detailOpen ? 'none' : 'auto'}
            accessibilityElementsHidden={detailOpen}
            importantForAccessibility={detailOpen ? 'no-hide-descendants' : 'auto'}
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>
                  {dateLabel} · {dayModeLabels[mode]}
                </Text>
                <Text accessibilityRole="header" style={styles.title}>
                  {mode === 'drive'
                    ? 'Matched passengers'
                    : mode === 'ride'
                      ? 'Matched drivers'
                      : 'Matched drivers and passengers'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close matches"
                disabled={requesting || chatBusy}
                onPress={() => dismiss(onClose)}
                style={styles.iconButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView
              ref={scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pageSizes}>
                <Text style={styles.muted}>View per page</Text>
                <View style={styles.sizeOptions}>
                  {MATCH_PAGE_SIZES.map((size) => (
                    <Pressable
                      key={size}
                      accessibilityRole="radio"
                      accessibilityLabel={`${size} per page`}
                      accessibilityState={{ checked: size === pageSize, disabled: busy }}
                      disabled={busy}
                      onPress={() => {
                        setPageSize(size);
                        changePage(Math.floor((current.page * pageSize) / size));
                      }}
                      style={[styles.size, size === pageSize && styles.sizeSelected]}
                    >
                      <Text
                        style={[styles.sizeLabel, size === pageSize && styles.sizeLabelSelected]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {pager('top')}
              {busy && (
                <View accessibilityLiveRegion="polite" style={styles.loading}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.muted}>
                    {chatBusy ? 'Opening chat…' : requesting ? 'Saving request…' : 'Finding matches…'}
                  </Text>
                </View>
              )}
              {current.people.map((item) => {
                const active = findTripRequest(requests, item.options[0], date);
                const best =
                  item.options.find(
                    (option) =>
                      active &&
                      (active.status === 'PENDING' || active.status === 'ACCEPTED') &&
                      option.driverId === active.driverId,
                  ) ?? item.options[0];
                return (
                  <Card key={item.id} style={styles.personCard}>
                    <View style={styles.personHeader}>
                      <View style={styles.avatar}>
                        <Text style={styles.initial}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.headerText}>
                        <Text style={styles.name}>{item.name}</Text>
                        <Text style={styles.muted}>
                          {item.options.length > 1
                            ? 'Can drive or ride'
                            : best.role === 'driver'
                              ? 'Driving'
                              : 'Looking for a ride'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.muted}>{item.area.label}</Text>
                    {best.eta?.model === 'TRAFFIC_FORECAST' && (
                      <Text style={styles.muted}>Traffic-aware forecast · TomTom</Text>
                    )}
                    <Text style={styles.muted}>
                      {best.driverId === uid ? 'You’re driving' : 'You’re riding'}
                    </Text>
                    <MatchTimes match={best} uid={uid} request={active} />
                    {requestActions(best, true)}
                    <AppButton label={chatBusy ? 'Opening chat…' : 'Send chat'} variant="secondary"
                      disabled={busy} onPress={() => void openChat(best)} />
                    <AppButton
                      label="View more"
                      accessibilityLabel={`View more about ${item.name}`}
                      variant="secondary"
                      disabled={busy}
                      onPress={() => {
                        setDriverOption(best.driverId);
                        setDetailId(item.id);
                      }}
                    />
                  </Card>
                );
              })}
              {!busy && !people.length && (
                <Card style={styles.personCard}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="people-outline" size={30} color={colors.textMuted} />
                  </View>
                  <Text style={styles.name}>
                    {message && !result ? 'Search unavailable' : 'No matches found'}
                  </Text>
                  {!result && (
                    <AppButton
                      label="Try again"
                      variant="secondary"
                      onPress={() => {
                        setDetailId(null);
                        changePage(0);
                        onRetry();
                      }}
                    />
                  )}
                </Card>
              )}
              {result?.incomplete && (
                <View style={styles.more}>
                  <Text style={styles.muted}>More matches may be available.</Text>
                  <AppButton
                    label="Find more matches"
                    disabled={busy}
                    variant="secondary"
                    onPress={onLoadMore}
                  />
                </View>
              )}
              {!!result?.unknownCount && (
                <Text style={styles.muted}>
                  Some road estimates or commute details are unavailable. Try searching again.
                </Text>
              )}
              {message && (
                <Text accessibilityLiveRegion="polite" style={styles.status}>
                  {message}
                </Text>
              )}
              {chatError && <Text accessibilityRole="alert">{chatError}</Text>}
              {pager('bottom')}
            </ScrollView>
          </View>
          {detailOpen && person && match && (
            <View style={styles.detailOverlay} accessibilityViewIsModal>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to matches"
                disabled={requesting || chatBusy}
                onPress={closeDetails}
                style={styles.backdrop}
              />
              <Animated.View
                style={[
                  styles.detailSheet,
                  { paddingBottom: insets.bottom },
                  {
                    transform: [
                      {
                        translateY: detailSlide.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 1000],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.header}>
                  <View style={styles.headerText}>
                    <Text style={styles.eyebrow}>{dateLabel}</Text>
                    <Text accessibilityRole="header" style={styles.title}>
                      {person.name}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to matches"
                    disabled={requesting || chatBusy}
                    onPress={closeDetails}
                    style={styles.iconButton}
                  >
                    <Ionicons name="close" size={24} color={colors.text} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.content}>
                  {person.options.length > 1 && (
                    <View style={styles.roleOptions}>
                      {person.options.map((option) => (
                        <Pressable
                          key={option.driverId}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: option.driverId === match.driverId,
                            disabled:
                              busy ||
                              request?.status === 'PENDING' ||
                              request?.status === 'ACCEPTED',
                          }}
                          disabled={
                            busy || request?.status === 'PENDING' || request?.status === 'ACCEPTED'
                          }
                          onPress={() => setDriverOption(option.driverId)}
                          style={[
                            styles.roleOption,
                            option.driverId === match.driverId && styles.sizeSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.link,
                              option.driverId === match.driverId && styles.sizeLabelSelected,
                            ]}
                          >
                            {option.driverId === uid ? 'I’m driving' : 'I’m riding'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <View
                    style={styles.mapFrame}
                    accessibilityLabel={`Map of your exact starting point and ${person.name}'s approximate ${person.area.radiusMiles}-mile area`}
                    accessibilityRole="image"
                  >
                    <MapView
                      key={JSON.stringify([ownPoint, person.area])}
                      style={StyleSheet.absoluteFill}
                      initialRegion={matchMapRegion(ownPoint, person.area)}
                      toolbarEnabled={false}
                    >
                      <Circle
                        center={person.area.center}
                        radius={person.area.radiusMiles * METERS_PER_MILE}
                        fillColor="rgba(153,0,0,0.12)"
                        strokeColor={colors.accent}
                        strokeWidth={2}
                      />
                      <Marker
                        coordinate={ownPoint}
                        title="Your starting point"
                        pinColor={colors.accent}
                      />
                    </MapView>
                  </View>
                  <Text style={styles.muted}>Your pin · {person.name}’s approximate area</Text>
                  <Card style={styles.personCard}>
                    <Text style={styles.name}>Estimated trip</Text>
                    <MatchTimes match={match} uid={uid} request={request} />
                    <Text style={styles.muted}>
                      {Math.ceil((match.plan.pickup - match.plan.departure) / 60)} min to pickup ·{' '}
                      {Math.ceil(match.addedDrivingSeconds / 60)} min added driving, including
                      boarding
                    </Text>
                    <Text style={styles.muted}>
                      New York time ·{' '}
                      {match.eta?.model === 'TRAFFIC_FORECAST'
                        ? 'Traffic-aware forecast · TomTom'
                        : 'Road estimate · no live traffic'}
                    </Text>
                    {match.eta && (
                      <Text style={styles.muted}>
                        Estimated {rideTime(match.eta.computedAtEpochSeconds)} · for departure{' '}
                        {rideTime(match.eta.departureEpochSeconds)}
                      </Text>
                    )}
                  </Card>
                  {staleTraffic && (!request || request.status === 'CANCELLED') && (
                    <Card style={styles.personCard}>
                      <Text style={styles.muted}>
                        This traffic forecast is over two minutes old.
                      </Text>
                      <AppButton
                        label="Refresh estimates"
                        disabled={busy}
                        onPress={() => {
                          setDetailId(null);
                          changePage(0);
                          onRetry();
                        }}
                      />
                    </Card>
                  )}
                  {requestActions(match)}
                  <AppButton label={chatBusy ? 'Opening chat…' : 'Send chat'} variant="secondary"
                    disabled={busy} onPress={() => void openChat(match)} />
                  {chatError && <Text accessibilityRole="alert">{chatError}</Text>}
                  {message && (
                    <Text accessibilityLiveRegion="polite" style={styles.status}>
                      {message}
                    </Text>
                  )}
                  <AppButton
                    label="Back to matches"
                    variant="secondary"
                    disabled={requesting || chatBusy}
                    onPress={closeDetails}
                  />
                </ScrollView>
              </Animated.View>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
function MatchTimes({
  match,
  uid,
  request,
}: {
  match: CalendarMatch;
  uid: string;
  request?: RideRequest;
}) {
  if (request?.status === 'PENDING' || request?.status === 'ACCEPTED')
    match = { ...match, driverId: request.driverId, riderId: request.riderId, plan: request.plan };
  return (
    <>
    <View style={styles.times}>
      {[
        ['Departure', match.plan.departure],
        ['Pickup', match.plan.pickup],
        [
          'Arrival',
          match.driverId === uid
            ? match.plan.vehicleCampusArrival
            : match.plan.riderDestinationArrival,
        ],
      ].map(([label, time]) => (
        <View key={label} style={styles.time}>
          <Text style={styles.timeLabel}>{label}</Text>
          <Text style={styles.timeValue}>{rideTime(time as number)}</Text>
        </View>
      ))}
    </View>
    {match.dropoffLabel && <Text style={styles.muted}>Drop-off · {request?.status === 'PENDING' || request?.status === 'ACCEPTED' ? request.campusLabel : match.dropoffLabel}
      {match.dropoffPreferenceMatch === false ? ` · Preferred: ${match.preferredDropoffLabel}` : match.preferredDropoffLabel === 'Any' ? ' · Any' : ''}
    </Text>}
    {match.savedDriverDeparture !== undefined && match.savedDriverDeparture !== match.plan.departure &&
      <Text style={styles.muted}>Driver’s usual departure · {rideTime(match.savedDriverDeparture)} · Review proposed time above</Text>}
    </>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.4)' },
  backdrop: { flex: 1 },
  sheet: {
    height: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  list: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerText: { flex: 1, gap: spacing.xs },
  eyebrow: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  title: { fontSize: 23, fontWeight: '800', color: colors.text },
  iconButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  muted: { color: colors.textMuted, lineHeight: 21 },
  status: { color: colors.accent, lineHeight: 21 },
  pageSizes: { gap: spacing.sm },
  sizeOptions: { flexDirection: 'row', gap: spacing.sm },
  size: {
    minHeight: 44,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sizeSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  sizeLabel: { color: colors.text, fontWeight: '700' },
  sizeLabelSelected: { color: colors.surface },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  pageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.xs,
  },
  pageLabel: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: 'center',
  },
  link: { color: colors.accent, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  loading: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  personCard: { padding: spacing.xl, gap: spacing.lg },
  personHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: colors.accent, fontSize: 22, fontWeight: '800' },
  name: { color: colors.text, fontSize: 19, fontWeight: '800' },
  times: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.md,
  },
  time: { flex: 1, minWidth: 74, gap: spacing.xs },
  timeLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  timeValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyIcon: { alignItems: 'flex-start' },
  more: { gap: spacing.sm },
  detailOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(23,33,43,0.4)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    height: '94%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  mapFrame: {
    height: 260,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleOptions: { flexDirection: 'row', gap: spacing.md },
  roleOption: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
