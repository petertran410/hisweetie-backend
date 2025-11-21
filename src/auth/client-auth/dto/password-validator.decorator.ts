import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsStrongPassword', async: false })
export class IsStrongPasswordConstraint
  implements ValidatorConstraintInterface
{
  validate(password: string, args: ValidationArguments) {
    if (!password) return false;

    // Tối thiểu 6 ký tự
    if (password.length < 6) return false;

    // Ít nhất 1 chữ cái in hoa
    if (!/[A-Z]/.test(password)) return false;

    // Ít nhất 1 ký tự đặc biệt
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Mật khẩu phải có ít nhất 6 ký tự, bao gồm ít nhất 1 chữ cái in hoa và 1 ký tự đặc biệt';
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
