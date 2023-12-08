import { z } from "zod";
import { Form, Input, useFormStore } from "./Form";
import { createForm } from "simple-stack-form/client";
import { useStore } from "@nanostores/react";

export const signup = createForm({
  username: z.string().min(2),
  optIn: z.boolean().optional(),
});

export default function Signup() {
  return (
    <Form
      className="flex flex-col gap-2 items-start"
      validator={signup.validator}
    >
      <FormGroup>
        <label htmlFor="name">Name</label>
        <Input id="name" {...signup.inputProps.username} />
      </FormGroup>
      <FormGroup>
        <label htmlFor="optIn">Opt in</label>
        <Input id="optIn" {...signup.inputProps.optIn} />
      </FormGroup>
      <Button>Submit</Button>
    </Form>
  );
}

function Button({ children }: { children: React.ReactNode }) {
  const form = useFormStore();

  return (
    <button
      disabled={form.value.containsErrors}
      className="bg-purple-700 rounded px-5 py-2"
    >
      {children}
    </button>
  );
}

function FormGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-3 items-center">{children}</div>;
}
