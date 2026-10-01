import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

// 44pt is the platform minimum touch target; icons sit centred inside it.
const TOUCH = 44

export const queueStyles = StyleSheet.create({
  stack: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs
  },
  heading: {
    color: colors.textSecondary,
    fontSize: typography.metaSize - 1,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  status: {
    flex: 1,
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm
  },
  noticeText: {
    flex: 1,
    minWidth: 160,
    color: colors.statusAmber,
    fontSize: typography.metaSize,
    lineHeight: typography.metaSize + 5
  },
  list: {
    maxHeight: 220
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH + spacing.xs,
    paddingLeft: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.row,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  rowEditing: {
    alignItems: 'stretch',
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    borderColor: colors.accentBlue
  },
  position: {
    width: 14,
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontVariant: ['tabular-nums'],
    textAlign: 'right'
  },
  body: {
    flex: 1,
    paddingVertical: spacing.sm,
    gap: 2
  },
  text: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    lineHeight: typography.bodySize + 6
  },
  textNotSent: {
    color: colors.textSecondary
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  metaText: {
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  metaWarning: {
    color: colors.statusAmber,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconButton: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button
  },
  disabled: {
    opacity: 0.35
  },
  pressed: {
    opacity: 0.6
  },
  editor: {
    flex: 1,
    gap: spacing.sm
  },
  input: {
    minHeight: 64,
    maxHeight: 140,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    lineHeight: typography.bodySize + 6,
    backgroundColor: colors.editorSurface,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    textAlignVertical: 'top'
  },
  editorButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm
  },
  button: {
    minHeight: TOUCH - 4,
    minWidth: 76,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgRaised
  },
  buttonPrimary: {
    borderColor: colors.accentBlue,
    backgroundColor: colors.accentBlue
  },
  buttonLabel: {
    color: colors.textPrimary,
    fontSize: typography.bodySize - 1,
    fontWeight: '600'
  },
  buttonLabelPrimary: {
    color: colors.onAccent
  }
})
