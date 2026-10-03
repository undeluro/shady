import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
export default function DateControl({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const value = new Date(`${date}T12:00:00`);
  const update = (_: unknown, selected?: Date) => {
    setOpen(false);
    if (selected)
      onChange(
        `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`,
      );
  };
  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <Text style={{ color: "#123B35", fontSize: 16 }}>Departure date</Text>
      {Platform.OS === "ios" ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="compact"
          themeVariant="light"
          accentColor="#168575"
          onChange={update}
        />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose departure date"
            onPress={() => setOpen(true)}
            style={{
              minHeight: 48,
              padding: 14,
              borderRadius: 16,
              backgroundColor: "#D8EFEA",
            }}
          >
            <Text style={{ color: "#123B35" }}>{date}</Text>
          </Pressable>
          {open && (
            <DateTimePicker value={value} mode="date" onChange={update} />
          )}
        </>
      )}
    </View>
  );
}
