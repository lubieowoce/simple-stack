import mapObject from "just-map-object";
import {
	ZodBoolean,
	type ZodError,
	ZodNumber,
	ZodObject,
	ZodOptional,
	type ZodRawShape,
	type ZodType,
	z,
} from "zod";

export { mapObject };

export type FormValidator = ZodRawShape;
export type FieldErrors<
	T extends { validator: FormValidator } = { validator: FormValidator },
> = ZodError<z.output<ZodObject<T["validator"]>>>["formErrors"]["fieldErrors"];

export type InputProp = {
	"aria-required": boolean;
	name: string;
	type: "text" | "number" | "checkbox";
};

export const formNameInputProps = {
	type: "hidden",
	name: "_formName",
} as const;

export type FieldState = {
	hasErroredOnce: boolean;
	isValidating: boolean;
	validator: ZodType;
	validationErrors: string[] | undefined;
};

export type FormState<TKey extends string | number | symbol = string> = {
	isSubmitPending: boolean;
	submitStatus: "idle" | "validating" | "submitting";
	hasFieldErrors: boolean;
	fields: Record<TKey, FieldState>;
};

export function createForm<T extends ZodRawShape>(validator: T) {
	return {
		inputProps: mapObject(validator, getInputProp),
		validator: preprocessValidators(validator),
	};
}

export function getInitialFormState({
	validator,
	fieldErrors,
}: { validator: FormValidator; fieldErrors: FieldErrors | undefined }) {
	return {
		hasFieldErrors: false,
		submitStatus: "idle",
		isSubmitPending: false,
		fields: mapObject(validator, (name, validator) => {
			const fieldError = fieldErrors?.[name];
			return {
				hasErroredOnce: !!fieldError?.length,
				validationErrors: fieldError,
				isValidating: false,
				validator,
			};
		}),
	} satisfies FormState;
}

function preprocessValidators<T extends ZodRawShape>(formValidator: T) {
	return Object.fromEntries(
		Object.entries(formValidator).map(([key, validator]) => {
			const inputType = getInputType(validator);
			switch (inputType) {
				case "checkbox":
					return [key, z.preprocess((value) => value === "on", validator)];
				case "number":
					return [key, z.preprocess(Number, validator)];
				case "text":
					return [
						key,
						z.preprocess(
							// Consider empty input as "required"
							(value) => (value === "" ? undefined : value),
							validator,
						),
					];
				default:
					return [key, validator];
			}
		}),
	) as T;
}

type Setter<T> = (callback: (previous: T) => T) => void;

function toSetFieldState<T extends FormState>(setFormState: Setter<T>) {
	return (key: string, getValue: (previous: FieldState) => FieldState) => {
		setFormState((formState) => {
			const fieldState = formState.fields[key];
			if (!fieldState) return formState;

			const fields = { ...formState.fields, [key]: getValue(fieldState) };
			const hasFieldErrors = Object.values(fields).some(
				(f) => f.validationErrors?.length,
			);
			return { ...formState, hasFieldErrors, fields };
		});
	};
}

export function toTrackAstroSubmitStatus<T extends FormState>(
	setFormState: Setter<T>,
) {
	return () => {
		setFormState((value) => ({
			...value,
			isSubmitPending: true,
			submitStatus: "submitting",
		}));
		document.addEventListener(
			"astro:after-preparation",
			() =>
				setFormState((value) => ({
					...value,
					isSubmitPending: false,
					submitStatus: "idle",
				})),
			{
				once: true,
			},
		);
	};
}

export function toValidateField<T extends FormState>(setFormState: Setter<T>) {
	const setFieldState = toSetFieldState(setFormState);

	return async (fieldName: string, inputValue: unknown, validator: ZodType) => {
		setFieldState(fieldName, (fieldState) => ({
			...fieldState,
			isValidating: true,
		}));
		const parsed = await validator.safeParseAsync(inputValue);
		if (parsed.success === false) {
			return setFieldState(fieldName, (fieldState) => ({
				...fieldState,
				hasErroredOnce: true,
				isValidating: false,
				validationErrors: parsed.error.errors.map((e) => e.message),
			}));
		}
		setFieldState(fieldName, (fieldState) => ({
			...fieldState,
			isValidating: false,
			validationErrors: undefined,
		}));
	};
}

export function toSetValidationErrors<T extends FormState>(
	setFormState: Setter<T>,
) {
	const setFieldState = toSetFieldState(setFormState);
	return (
		fieldErrors: ZodError<Record<string, unknown>>["formErrors"]["fieldErrors"],
	) => {
		for (const [key, validationErrors] of Object.entries(fieldErrors)) {
			setFieldState(key, (fieldState) => ({
				...fieldState,
				hasErroredOnce: true,
				validationErrors,
			}));
		}
	};
}

function getInputProp<T extends ZodType>(name: string, fieldValidator: T) {
	const inputProp: InputProp = {
		name,
		"aria-required":
			!fieldValidator.isOptional() && !fieldValidator.isNullable(),
		type: getInputType<T>(fieldValidator),
	};

	return inputProp;
}

function getInputType<T extends ZodType>(fieldValidator: T): InputProp["type"] {
	const resolvedType =
		fieldValidator instanceof ZodOptional
			? fieldValidator._def.innerType
			: fieldValidator;

	if (resolvedType instanceof ZodBoolean) {
		return "checkbox";
	} else if (resolvedType instanceof ZodNumber) {
		return "number";
	} else {
		return "text";
	}
}

export async function validateForm<T extends ZodRawShape>({
	formData,
	validator,
}: { formData: FormData; validator: T }) {
	const result = await z
		.preprocess((formData) => {
			if (!(formData instanceof FormData)) return formData;

			// TODO: handle multiple inputs with same key
			return Object.fromEntries(formData);
		}, z.object(validator))
		.safeParseAsync(formData);

	if (result.success) {
		return { data: result.data, fieldErrors: undefined };
	}
	return {
		data: undefined,
		fieldErrors: result.error.formErrors.fieldErrors,
	};
}