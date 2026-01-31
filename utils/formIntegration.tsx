/**
 * Form Integration Utilities
 * Connects Zod validation schemas with React forms
 * Provides hooks for form validation, submission, and error handling
 */

import React from 'react';
import { z, ZodSchema, ZodError } from 'zod';
import { useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { validateData, sanitizeFormData } from './validationSchemas';
import { handleError } from './errorHandler';
import { useToastNotification } from './toastUtils';

// ============== FORM ERROR TYPES ==============

export interface FormErrors {
  [fieldName: string]: string[];
}

export interface FormState<T> {
  values: T;
  errors: FormErrors;
  touched: Set<string>;
  isSubmitting: boolean;
  isDirty: boolean;
}

// ============== USE FORM HOOK ==============

/**
 * Custom hook for form handling with Zod validation
 * @template T - Form data type
 */
export function useForm<T extends Record<string, any>>(
  initialValues: T,
  validationSchema?: ZodSchema,
  onSubmit?: (values: T) => Promise<void>
) {
  const toast = useToastNotification();
  const [formState, setFormState] = useState<FormState<T>>({
    values: initialValues,
    errors: {},
    touched: new Set(),
    isSubmitting: false,
    isDirty: false,
  });

  /**
   * Handle field change
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value, type } = e.target;
      const fieldValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

      setFormState((prev) => ({
        ...prev,
        values: { ...prev.values, [name]: fieldValue },
        isDirty: true,
      }));
    },
    []
  );

  /**
   * Handle field blur (mark as touched)
   */
  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name } = e.target;
    setFormState((prev) => ({
      ...prev,
      touched: new Set(prev.touched).add(name),
    }));
  }, []);

  /**
   * Validate single field
   */
  const validateField = useCallback(
    async (fieldName: string, value: any): Promise<boolean> => {
      if (!validationSchema) return true;

      try {
        // Extract schema for single field if possible
        if (validationSchema instanceof z.ZodObject) {
          const fieldSchema = (validationSchema as any).shape[fieldName];
          if (fieldSchema) {
            await fieldSchema.parseAsync(value);
          }
        }
        return true;
      } catch (error) {
        if (error instanceof ZodError) {
          const fieldErrors = error.issues.map((e) => e.message);
          setFormState((prev) => ({
            ...prev,
            errors: { ...prev.errors, [fieldName]: fieldErrors },
          }));
          return false;
        }
        return false;
      }
    },
    [validationSchema]
  );

  /**
   * Validate entire form
   */
  const validateForm = useCallback(async (): Promise<boolean> => {
    if (!validationSchema) return true;

    try {
      await validationSchema.parseAsync(formState.values);
      setFormState((prev) => ({ ...prev, errors: {} }));
      return true;
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: FormErrors = {};
        error.issues.forEach((err) => {
          const path = String(err.path[0]);
          if (!errors[path]) {
            errors[path] = [];
          }
          errors[path].push(err.message);
        });
        setFormState((prev) => ({ ...prev, errors }));
        toast.error('يوجد أخطاء في البيانات المدخلة'); // There are errors in the entered data
        return false;
      }
      return false;
    }
  }, [validationSchema, formState.values, toast]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      if (e) {
        e.preventDefault();
      }

      // Validate form
      const isValid = await validateForm();
      if (!isValid) return;

      // Sanitize data before submission
      const sanitizedData = sanitizeFormData(formState.values) as T;

      if (onSubmit) {
        try {
          setFormState((prev) => ({ ...prev, isSubmitting: true }));
          await onSubmit(sanitizedData);
          toast.saved(); // Saved successfully
          setFormState((prev) => ({
            ...prev,
            isDirty: false,
            isSubmitting: false,
          }));
        } catch (error) {
          handleError(error, { logToConsole: true });
          toast.error(String(error));
          setFormState((prev) => ({ ...prev, isSubmitting: false }));
        }
      }
    },
    [validateForm, formState.values, onSubmit, toast]
  );

  /**
   * Reset form to initial values
   */
  const resetForm = useCallback(() => {
    setFormState({
      values: initialValues,
      errors: {},
      touched: new Set(),
      isSubmitting: false,
      isDirty: false,
    });
  }, [initialValues]);

  /**
   * Set field value programmatically
   */
  const setFieldValue = useCallback((fieldName: string, value: any) => {
    setFormState((prev) => ({
      ...prev,
      values: { ...prev.values, [fieldName]: value },
      isDirty: true,
    }));
  }, []);

  /**
   * Get field error message
   */
  const getFieldError = (fieldName: string): string | undefined => {
    const errors = formState.errors[fieldName];
    return errors && errors.length > 0 ? errors[0] : undefined;
  };

  /**
   * Check if field has error and is touched
   */
  const hasFieldError = (fieldName: string): boolean => {
    return (
      formState.touched.has(fieldName) &&
      formState.errors[fieldName] &&
      formState.errors[fieldName].length > 0
    );
  };

  return {
    // State
    values: formState.values,
    errors: formState.errors,
    touched: formState.touched,
    isSubmitting: formState.isSubmitting,
    isDirty: formState.isDirty,

    // Handlers
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,

    // Validation
    validateField,
    validateForm,

    // Utilities
    resetForm,
    getFieldError,
    hasFieldError,

    // State setters for custom usage
    setFormState,
  };
}

// ============== FORM FIELD COMPONENT ==============

export interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  touched?: boolean;
  containerClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
  errorClassName?: string;
}

/**
 * Reusable form field component with validation display
 */
export function FormField({
  label,
  error,
  helperText,
  touched,
  containerClassName = '',
  labelClassName = 'block text-sm font-medium text-gray-700 mb-1',
  inputClassName = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
  errorClassName = 'mt-1 text-sm text-red-600',
  ...inputProps
}: FormFieldProps) {
  const showError = touched && error;

  return (
    <div className={containerClassName}>
      {label && <label className={labelClassName}>{label}</label>}
      <input
        {...inputProps}
        className={`${inputClassName} ${showError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
      />
      {showError && <p className={errorClassName}>{error}</p>}
      {helperText && !showError && <p className="mt-1 text-sm text-gray-500">{helperText}</p>}
    </div>
  );
}

// ============== VALIDATION WRAPPER ==============

/**
 * HOC to add validation to form components
 */
export function withFormValidation<P extends object>(
  Component: React.ComponentType<P & { form: ReturnType<typeof useForm> }>,
  validationSchema: ZodSchema,
  initialValues: any
) {
  return function ValidatedComponent(props: P) {
    const form = useForm(initialValues, validationSchema);

    return <Component {...(props as any)} form={form} />;
  };
}

// ============== FORM SUBMISSION HELPER ==============

/**
 * Generic form submission handler with error handling
 */
export async function submitFormData<T extends Record<string, any>>(
  data: T,
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST',
  headers: HeadersInit = { 'Content-Type': 'application/json' }
): Promise<any> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    handleError(error, { logToConsole: true });
    throw error;
  }
}

// ============== BATCH FORM OPERATIONS ==============

/**
 * Validate multiple form data objects
 */
export async function validateMultipleForms<T extends Record<string, any>>(
  formsData: Record<string, T>,
  validationSchemas: Record<string, ZodSchema>
): Promise<{ valid: boolean; errors: Record<string, FormErrors> }> {
  const errors: Record<string, FormErrors> = {};
  let valid = true;

  for (const [formName, data] of Object.entries(formsData)) {
    const schema = validationSchemas[formName];
    if (!schema) continue;

    try {
      await schema.parseAsync(data);
    } catch (error) {
      valid = false;
      if (error instanceof ZodError) {
        const formErrors: FormErrors = {};
        error.issues.forEach((err) => {
          const path = String(err.path[0]);
          if (!formErrors[path]) {
            formErrors[path] = [];
          }
          formErrors[path].push(err.message);
        });
        errors[formName] = formErrors;
      }
    }
  }

  return { valid, errors };
}

// ============== AUTO-SAVE HELPER ==============

/**
 * Auto-save form data with debouncing
 */
export function useAutoSaveForm<T extends Record<string, any>>(
  values: T,
  onSave: (values: T) => Promise<void>,
  delayMs: number = 3000
) {
  const [isSaving, setIsSaving] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        await onSave(values);
        setIsSaving(false);
      } catch (error) {
        handleError(error, { logToConsole: true });
        setIsSaving(false);
      }
    }, delayMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [values, onSave, delayMs]);

  return { isSaving };
}
