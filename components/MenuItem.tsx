import { fonts } from '@/theme/typography';
import { colors } from '@/theme';
import { homeColors } from '@/theme/colors';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Toggle } from '@/components/ui/Toggle';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
        accessibilityRole={type === 'toggle' ? undefined : 'button'}
        style={styles.container}
        onPress={onPress}
        activeOpacity={type === 'toggle' ? 1 : 0.7}
        disabled={type === 'toggle'}
      >
        {/* 左侧图标和文字 */}
        <View style={styles.leftSection}>
          <View style={styles.iconContainer}>
            <Feather name={icon} size={20} color={homeColors.deep} />
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
            <Toggle label={title} value={!!toggleValue} onValueChange={onToggle ?? (() => {})} />
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
    borderRadius: 14,
    backgroundColor: homeColors.nav,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    fontFamily: fonts.medium,
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 2,
  },
  value: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: fonts.regular,
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

