import { colors } from '@/theme';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

interface MenuItemProps {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  iconBgColor: string;
  title: string;
  subtitle?: string;
  value?: string;
  type?: 'navigation' | 'toggle';
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  showDivider?: boolean;
}

export default function MenuItem({
  icon,
  iconColor,
  iconBgColor,
  title,
  subtitle,
  value,
  type = 'navigation',
  toggleValue = false,
  onToggle,
  onPress,
  showDivider = true,
}: MenuItemProps) {
  return (
    <>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={type === 'toggle' ? 1 : 0.7}
        disabled={type === 'toggle'}
      >
        {/* 左侧图标和文字 */}
        <View style={styles.leftSection}>
          <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
            <Feather name={icon} size={20} color={iconColor} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {value && <Text style={styles.value}>{value}</Text>}
          </View>
        </View>

        {/* 右侧操作 */}
        <View style={styles.rightSection}>
          {type === 'toggle' ? (
            <Switch
              value={toggleValue}
              onValueChange={onToggle}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.border}
            />
          ) : (
            <Feather name="chevron-right" size={20} color={colors.muted} />
          )}
        </View>
      </TouchableOpacity>
      {showDivider && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surf,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_500',
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_400',
    color: colors.muted,
    marginTop: 2,
  },
  value: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    marginTop: 2,
  },
  rightSection: {
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 68, // 对齐文字部分
  },
});

