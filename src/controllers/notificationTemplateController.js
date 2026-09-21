import NotificationTemplateService from '../services/notificationTemplateService.js';
import {
  validateCreateTemplate,
  validateUpdateTemplate
} from '../validators/notificationTemplateValidator.js';

export const getTemplates = async (req, res) => {
  try {
    const { type, channel, isActive } = req.query;
    const templates = await NotificationTemplateService.getTemplates({
      gymId: req.user.gymId,
      type: type ? String(type).toUpperCase() : undefined,
      channel: channel ? String(channel).toUpperCase() : undefined,
      isActive: isActive !== undefined ? isActive === 'true' || isActive === '1' : undefined
    });

    return res.status(200).json({ success: true, data: templates });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const getTemplateById = async (req, res) => {
  try {
    const template = await NotificationTemplateService.getTemplateById({
      gymId: req.user.gymId,
      templateId: req.params.id
    });

    return res.status(200).json({ success: true, data: template });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const createTemplate = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateTemplate(req.body);
    if (!isValid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const template = await NotificationTemplateService.createTemplate({
      gymId: req.user.gymId,
      ...req.body
    });

    return res.status(201).json({
      success: true,
      message: 'Notification template created successfully',
      data: template
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const { isValid, errors } = validateUpdateTemplate(req.body);
    if (!isValid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const updated = await NotificationTemplateService.updateTemplate({
      gymId: req.user.gymId,
      templateId: req.params.id,
      ...req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Notification template updated successfully',
      data: updated
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const result = await NotificationTemplateService.deleteTemplate({
      gymId: req.user.gymId,
      templateId: req.params.id
    });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};
