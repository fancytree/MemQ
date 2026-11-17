import { fonts } from '@/theme/typography';
import { space, radius, type, colors } from '@/theme';
import { Icon, type IconName } from '@/components/ui/Icon';
import React from 'react';
import { Toggle } from '@/components/ui/Toggle';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface MenuItemProps {
  icon: IconName;
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
            <Icon name={icon} color={colors.sub} />
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
            <Icon name="chevronRight" size={20} color={colors.sub} />
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
    paddingVertical: space[3],
    paddingHorizontal: space[4],
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
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space[3],
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...type.small, fontFamily: fonts.medium,
    color: colors.text,
    marginBottom: space.hair,
  },
  subtitle: {
    ...type.caption, fontFamily: fonts.regular,
    letterSpacing: -0.1,
    color: colors.sub,
    marginTop: space.hair,
  },
  value: {
    ...type.caption, fontFamily: fonts.regular,
    letterSpacing: -0.1,
    color: colors.text,
    marginTop: space.hair,
  },
  rightSection: {
    marginLeft: space[3],
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginLeft: 68, // 对齐文字部分
  },
});

