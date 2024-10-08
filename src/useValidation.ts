import { Primitive, PrimitiveValidatorTypes, RecursiveValidation, ValidationConfig, ValidationState } from "./publicTypes";
import { Ref, ref, computed, watch, reactive } from "vue";
import { IndexableObject, PropertyValidationConfig } from "./privateTypes";
import { invokeValidatorConfigs } from "./services/validatorInvocation";
import { configureValidationOnProperty, isPrimitiveOrArrayValidation, setupNestedPropertiesForValidation } from "./services/validatorProcessing";

/** 
 * A simple and lightweight Vue3 model based validation library with strong type support.
 * 
 * @author Daniel Walbolt
 */
export function useValidation<
	T,
	Args = undefined,
	FValidationReturn = unknown
>(
	validationConfig: ValidationConfig<T, Args | undefined, FValidationReturn>
) {
	validationConfig.delayReactiveValidation ??= true; // Default value for delayReactiveValidation
	const { objectToValidate: object, validation, delayReactiveValidation, args } = validationConfig;

	/** Only true after {@link validate()} finished successfully. */
	const hasValidated = ref(false);
	const isValidating = computed(() => validationConfigs.some(x => x.validationState.isValidating));
	const isValid = computed(() => {
		const allValidatorsValid = validationConfigs.every(x => x.isReactiveValid.value && x.isLazyValid.value);
		return allValidatorsValid;
	});
	/** List of objects that relates validation to the object's properties. */
	let validationConfigs: PropertyValidationConfig<any, T, any, FValidationReturn>[] = [];
	let propertyState: ValidationState<T, FValidationReturn> = reactive({} as any);

	/** The reference for determining if the object has been changed or not.  */
	const dirtyReference = ref(JSON.stringify(validationConfig.objectToValidate.value));
	/** 
	 * Reactively determines if the object being validated has changed from the reference state.
	 * 
	 * The reference state can be changed using {@link setReference()}.
	 */
	const isDirty = computed(() => dirtyReference.value !== JSON.stringify(validationConfig.objectToValidate.value));

	// Based on the validation we are provided, we can assume what the object is supposed to be.
	const isPrimitiveOrArray = isPrimitiveOrArrayValidation(validation);

	// If the object is a primitive type or undefined (at time of initialization) we will treat it as singular property validation
	if (isPrimitiveOrArray) {
		// The user is attempting to add validation onto a singular property instead of an object.
		// Assert the type of the provided ref to a more accurate type that describes the state of this branch.
		const typedValidation = validation as PrimitiveValidatorTypes<Primitive | undefined, T, Args | undefined, FValidationReturn, any>;
		const typedObject = object as Ref<Primitive>;
		const validatedPropertyConfig = configureValidationOnProperty(typedObject, typedValidation);
		propertyState = reactive(validatedPropertyConfig.validationState) as any; // typescript can't comprehend this type
		validationConfigs = [validatedPropertyConfig];
	}
	else {
		const typedObject = object as Ref<IndexableObject>;
		const typedValidation = validation as RecursiveValidation<typeof typedObject, T, Args, FValidationReturn, any, number>;
		const validationSetup = setupNestedPropertiesForValidation<IndexableObject, T, Args, FValidationReturn>(typedObject.value, typedValidation);
		propertyState = reactive(validationSetup.state) as ValidationState<T, FValidationReturn>;
		validationConfigs = validationSetup.validationConfigs;
	}

	/** 
	 * Watch the object for any changes.
	 * This is the alternative to watching every property individually.
	 * This may be more costly on performance, but does allow for property inter-dependence.
	 * Editing one property will invoke the reactive validators of every other and itself.
	 */
	watch(
		validationConfig.objectToValidate,
		() => {
			if (delayReactiveValidation) {
				if (hasValidated.value === true) {
					invokeValidatorConfigs(validationConfigs, object, args, true, false)
				}
			}
			else {
				invokeValidatorConfigs(validationConfigs, object, args, true, false)
			}
		},
		{ deep: true }
	);

	/** Invokes all reactive and lazy validators. Returns whether or not all validators passed.*/
	async function validate() {
		const isValid = await invokeValidatorConfigs(validationConfigs, object, args, true, true);
		hasValidated.value = true;
		return isValid;
	}

	/** Change the reference object to compare the current object state against. The reference is used to determine dirty state. */
	function setReference(reference: T) {
		dirtyReference.value = JSON.stringify(reference);
	}

	return reactive({
		hasValidated,
		validate,
		isValidating,
		propertyState: computed(() => propertyState),
		isValid,
		setReference,
		isDirty
	});
}