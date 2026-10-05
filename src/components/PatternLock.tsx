import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { colors, fonts, spacing } from '@/theme/tokens';

export interface PatternLockProps {
  onPatternComplete: (pattern: string) => void;
  minPoints?: number;
  disabled?: boolean;
  error?: string | null;
  size?: number;
  tone?: 'light' | 'dark';
}

interface Point {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
}

export function PatternLock({
  onPatternComplete,
  minPoints = 4,
  disabled = false,
  error = null,
  size = 300,
  tone = 'dark',
}: PatternLockProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentTouch, setCurrentTouch] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'drawing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(error);

  const containerLayout = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: size,
    height: size,
  });

  const shakeAnim = useSharedValue(0);

  const triggerShake = useCallback(() => {
    shakeAnim.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  }, [shakeAnim]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeAnim.value }],
    };
  });

  // Calculate 3x3 grid point centers
  const points = useMemo<Point[]>(() => {
    const pts: Point[] = [];
    const padding = 45;
    const step = (size - padding * 2) / 2;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        pts.push({
          id: r * 3 + c,
          row: r,
          col: c,
          x: padding + c * step,
          y: padding + r * step,
        });
      }
    }
    return pts;
  }, [size]);

  // Intermediate node detection (e.g. crossing 0 -> 2 passes 1)
  const getIntermediatePoint = useCallback((p1: Point, p2: Point): Point | null => {
    if (Math.abs(p1.row - p2.row) === 2 && p1.col === p2.col) {
      return points.find((p) => p.row === 1 && p.col === p1.col) ?? null;
    }
    if (Math.abs(p1.col - p2.col) === 2 && p1.row === p2.row) {
      return points.find((p) => p.col === 1 && p.row === p1.row) ?? null;
    }
    if (Math.abs(p1.row - p2.row) === 2 && Math.abs(p1.col - p2.col) === 2) {
      return points.find((p) => p.row === 1 && p.col === 1) ?? null;
    }
    return null;
  }, [points]);

  const hitRadius = 34;

  const handleTouch = useCallback(
    (touchX: number, touchY: number) => {
      if (disabled || status === 'error' || status === 'success') return;

      const hit = points.find((p) => {
        const dx = p.x - touchX;
        const dy = p.y - touchY;
        return Math.sqrt(dx * dx + dy * dy) <= hitRadius;
      });

      if (hit) {
        setSelectedIds((prev) => {
          if (prev.includes(hit.id)) return prev;

          // Check for skipped middle node
          const newIds = [...prev];
          if (prev.length > 0) {
            const lastId = prev[prev.length - 1];
            const lastPoint = points.find((p) => p.id === lastId);
            if (lastPoint) {
              const middle = getIntermediatePoint(lastPoint, hit);
              if (middle && !prev.includes(middle.id)) {
                newIds.push(middle.id);
              }
            }
          }

          newIds.push(hit.id);
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
          return newIds;
        });
        setStatus('drawing');
      }

      setCurrentTouch({ x: touchX, y: touchY });
    },
    [disabled, status, points, getIntermediatePoint]
  );

  const handleEnd = useCallback(() => {
    if (disabled || status === 'error' || status === 'success') return;

    setCurrentTouch(null);

    if (selectedIds.length === 0) {
      setStatus('idle');
      return;
    }

    if (selectedIds.length < minPoints) {
      setStatus('error');
      setErrorMessage(`Connect at least ${minPoints} dots`);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}
      triggerShake();
      setTimeout(() => {
        setSelectedIds([]);
        setStatus('idle');
        setErrorMessage(null);
      }, 900);
      return;
    }

    // Pattern completed
    const patternStr = selectedIds.join('-');
    setStatus('success');
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    onPatternComplete(patternStr);

    setTimeout(() => {
      setSelectedIds([]);
      setStatus('idle');
      setErrorMessage(null);
    }, 500);
  }, [disabled, status, selectedIds, minPoints, onPatternComplete, triggerShake]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          handleTouch(locationX, locationY);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          handleTouch(locationX, locationY);
        },
        onPanResponderRelease: () => {
          handleEnd();
        },
        onPanResponderTerminate: () => {
          handleEnd();
        },
      }),
    [disabled, handleTouch, handleEnd]
  );

  const onLayout = (evt: LayoutChangeEvent) => {
    const { x, y, width, height } = evt.nativeEvent.layout;
    containerLayout.current = { x, y, width, height };
  };

  // Color scheme based on status and tone
  const lineColor = useMemo(() => {
    if (status === 'error') return colors.danger;
    if (status === 'success') return colors.gold;
    return tone === 'dark' ? colors.goldLight : colors.brand;
  }, [status, tone]);

  const polylinePoints = useMemo(() => {
    return selectedIds
      .map((id) => {
        const p = points.find((pt) => pt.id === id);
        return p ? `${p.x},${p.y}` : '';
      })
      .filter(Boolean)
      .join(' ');
  }, [selectedIds, points]);

  const lastSelectedPoint = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const lastId = selectedIds[selectedIds.length - 1];
    return points.find((p) => p.id === lastId) ?? null;
  }, [selectedIds, points]);

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : (
        <Text style={[styles.instructionText, tone === 'light' && { color: colors.textSecondary }]}>
          {status === 'drawing' ? 'Release to confirm' : `Connect at least ${minPoints} dots`}
        </Text>
      )}

      <View
        style={[styles.container, { width: size, height: size }]}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {/* Completed lines */}
          {polylinePoints ? (
            <Polyline
              points={polylinePoints}
              fill="none"
              stroke={lineColor}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          ) : null}

          {/* Current dragging line */}
          {lastSelectedPoint && currentTouch && status === 'drawing' ? (
            <Line
              x1={lastSelectedPoint.x}
              y1={lastSelectedPoint.y}
              x2={currentTouch.x}
              y2={currentTouch.y}
              stroke={lineColor}
              strokeWidth="4"
              strokeLinecap="round"
              opacity={0.65}
            />
          ) : null}

          {/* Render 9 Nodes */}
          {points.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            const isLast = lastSelectedPoint?.id === p.id;

            const dotFill = isSelected
              ? lineColor
              : tone === 'dark'
                ? 'rgba(255, 255, 255, 0.45)'
                : colors.borderStrong;

            const ringStroke = isSelected
              ? lineColor
              : tone === 'dark'
                ? 'rgba(255, 255, 255, 0.15)'
                : colors.border;

            return (
              <View key={p.id}>
                {/* Outer touch halo ring */}
                <Circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 26 : 18}
                  fill={isSelected ? (status === 'error' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(242, 184, 46, 0.18)') : 'transparent'}
                  stroke={ringStroke}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />

                {/* Inner center dot */}
                <Circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? (isLast ? 9 : 8) : 6}
                  fill={dotFill}
                />
              </View>
            );
          })}
        </Svg>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'none',
  },
  instructionText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    minHeight: 18,
  },
  errorText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    minHeight: 18,
  },
});
