import { Request, Response } from 'express';
import { getCachedHIRSToken } from '../../../services/hirs/hirsToken';
import axios from 'axios';
import { fcmAgent } from '../../../config/httpAgent';

const FCM_NOTIFICATION_URL = 'https://fcm.googleapis.com/fcm/notification';
const PROJECT_ID = '859317105403';
const TIMEOUT = 15000;

function makeHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    'access_token_auth': 'true',
    'Authorization': `Bearer ${accessToken}`,
    'project_id': PROJECT_ID,
  };
}

function validateGroupFields(req: Request, res: Response): boolean {
  const { notification_key_name, registration_ids } = req.body;
  if (!notification_key_name || !registration_ids) {
    res.status(400).json({
      meta: { code: 400, status: 'Failed', error: 'notification_key_name and registration_ids are required' },
    });
    return false;
  }
  return true;
}

export const createNotificationKey = async (req: Request, res: Response): Promise<void> => {
  if (!validateGroupFields(req, res)) return;

  const { notification_key_name, registration_ids } = req.body;

  try {
    const accessToken = await getCachedHIRSToken();

    const responseData = await axios.post(FCM_NOTIFICATION_URL, {
      operation: 'create',
      notification_key_name,
      registration_ids,
    }, { headers: makeHeaders(accessToken), timeout: TIMEOUT, httpsAgent: fcmAgent });

    res.status(responseData.status).json({
      meta: { code: 100, status: 'Success', notification_key: responseData.data.notification_key },
    });
  } catch (error: any) {
    res.status(200).json({
      meta: { code: 200, status: 'Failed', messages: error?.response?.data || error.message },
    });
  }
};

export const adduserToGroup = async (req: Request, res: Response): Promise<void> => {
  if (!validateGroupFields(req, res)) return;

  const { notification_key_name, registration_ids, notification_key } = req.body;

  try {
    const accessToken = await getCachedHIRSToken();

    const responseData = await axios.post(FCM_NOTIFICATION_URL, {
      operation: 'add',
      notification_key_name,
      notification_key,
      registration_ids,
    }, { headers: makeHeaders(accessToken), timeout: TIMEOUT, httpsAgent: fcmAgent });

    res.status(responseData.status).json({
      meta: { code: 100, status: 'Success', notification_key: responseData.data.notification_key },
    });
  } catch (error: any) {
    res.status(200).json({
      meta: { code: 200, status: 'Failed', messages: error?.response?.data || error.message },
    });
  }
};

export const removeuserFromGroup = async (req: Request, res: Response): Promise<void> => {
  if (!validateGroupFields(req, res)) return;

  const { notification_key_name, registration_ids, notification_key } = req.body;

  try {
    const accessToken = await getCachedHIRSToken();

    const responseData = await axios.post(FCM_NOTIFICATION_URL, {
      operation: 'remove',
      notification_key_name,
      notification_key,
      registration_ids,
    }, { headers: makeHeaders(accessToken), timeout: TIMEOUT, httpsAgent: fcmAgent });

    res.status(responseData.status).json({
      meta: { code: 100, status: 'Success', notification_key: responseData.data.notification_key },
    });
  } catch (error: any) {
    res.status(200).json({
      meta: { code: 200, status: 'Failed', messages: error?.response?.data || error.message },
    });
  }
};
