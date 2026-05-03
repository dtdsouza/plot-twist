const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return 'Email is required';
  }

  if (!EMAIL_REGEX.test(email)) {
    return 'Please enter a valid email address';
  }

  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Password is required';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }

  if (password.length > 128) {
    return 'Password must be at most 128 characters';
  }

  return null;
}

export function validateDisplayName(name: string): string | null {
  if (!name.trim()) {
    return 'Display name is required';
  }

  if (name.trim().length < 2) {
    return 'Display name must be at least 2 characters';
  }

  if (name.trim().length > 100) {
    return 'Display name must be at most 100 characters';
  }

  return null;
}

export function validateLoginForm(data: {
  email: string;
  password: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(data.email);
  if (emailError) {
    errors['email'] = emailError;
  }

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    errors['password'] = passwordError;
  }

  return errors;
}

export function validateRegisterForm(data: {
  email: string;
  password: string;
  displayName: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(data.email);
  if (emailError) {
    errors['email'] = emailError;
  }

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    errors['password'] = passwordError;
  }

  const displayNameError = validateDisplayName(data.displayName);
  if (displayNameError) {
    errors['displayName'] = displayNameError;
  }

  return errors;
}

export function validateForgotPasswordForm(data: {
  email: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(data.email);
  if (emailError) {
    errors['email'] = emailError;
  }

  return errors;
}

export function validateResetPasswordForm(data: {
  password: string;
  confirmPassword: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    errors['password'] = passwordError;
    return errors;
  }

  if (data.password !== data.confirmPassword) {
    errors['confirmPassword'] = 'Passwords must match';
  }

  return errors;
}
