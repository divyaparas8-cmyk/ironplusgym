import ReminderService from '../services/reminderService.js';
import DunningService from '../services/dunningService.js';
import {
  validateGetRemindersQuery,
  validateCreateReminder,
  validateUpdateReminderStatus
} from '../validators/reminderValidator.js';

export const getReminders = async (req, res) => {
  try {
    const { isValid, errors, sanitized } = validateGetRemindersQuery(req.query);
    if (!isValid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const result = await ReminderService.getReminders({
      gymId: req.user.gymId,
      ...sanitized
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const getReminderById = async (req, res) => {
  try {
    const reminder = await ReminderService.getReminderById({
      gymId: req.user.gymId,
      reminderId: req.params.id
    });

    return res.status(200).json({ success: true, data: reminder });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const createReminder = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateReminder(req.body);
    if (!isValid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const reminder = await ReminderService.createReminder({
      gymId: req.user.gymId,
      userId: req.user.userId,
      ...req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Reminder created successfully',
      data: reminder
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const updateReminderStatus = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateReminderStatus(req.body);
    if (!isValid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const updated = await ReminderService.updateReminderStatus({
      gymId: req.user.gymId,
      reminderId: req.params.id,
      status: req.body.status,
      failureReason: req.body.failureReason
    });

    return res.status(200).json({
      success: true,
      message: 'Reminder status updated',
      data: updated
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const deleteReminder = async (req, res) => {
  try {
    const result = await ReminderService.deleteReminder({
      gymId: req.user.gymId,
      reminderId: req.params.id
    });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const processBatchReminders = async (req, res) => {
  try {
    const gymId = req.user.gymId;

    const [upcoming, overdue, expiry] = await Promise.all([
      DunningService.processUpcomingPaymentReminders({ gymId }),
      DunningService.processOverduePaymentReminders({ gymId }),
      DunningService.processMembershipExpiryReminders({ gymId })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Batch reminders processed successfully',
      data: {
        upcoming,
        overdue,
        expiry
      }
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};
