import { TextInput } from "react-native";
export default function DateControl({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  return (
    <TextInput
      accessibilityLabel="Departure date YYYY-MM-DD"
      value={date}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      style={{
        minHeight: 52,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#CADFD5",
        padding: 14,
        fontSize: 16,
        color: "#123B35",
        backgroundColor: "#FFF",
      }}
    />
  );
}
