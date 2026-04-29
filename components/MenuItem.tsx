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
              trackColor={{ false: '#E5E7EB', true: '#6366F1' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E5E7EB"
            />
          ) : (
            <Feather name="chevron-right" size={20} color="#9CA3AF" />
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
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  value: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '400',
    marginTop: 2,
  },
  rightSection: {
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 68, // 对齐文字部分
  },
});

