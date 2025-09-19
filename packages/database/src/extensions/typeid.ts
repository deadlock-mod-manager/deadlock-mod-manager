import { customType } from "drizzle-orm/pg-core";
import { TypeID } from "typeid-js";

export const typeId = <TPrefix extends string>(name: string, prefix: TPrefix) =>
  customType<{
    data: string;
    driverData: string;
  }>({
    dataType() {
      return "text";
    },
    toDriver(value: TypeID<TPrefix> | string): string {
      return value.toString();
    },
    fromDriver(value: string): string {
      return TypeID.fromString(value, prefix).toString();
    },
  })(name);

export { typeid as generateId } from "typeid-js";
